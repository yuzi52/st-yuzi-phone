import { getFreshSillyTavernContext } from '../../integration/context-bridge.js';
import { withWorldbookWrite, mergeWorldbookChanges } from '../../integration/worldbook-write.js';
import {
    getCurrentCharacterWorldbooks,
    getWorldbookNames,
} from '../../integration/tavern-helper-bridge.js';

function optionalBookName(value) {
    return String(value ?? '').trim().slice(0, 256);
}

function bookName(value) {
    const name = optionalBookName(value);
    if (!name) {
        throw new QQV2WorldbookGatewayError('QQ 目标世界书名称不能为空', 'worldbook_target_invalid');
    }
    return name;
}

function uniqueBookNames(values, excluded = []) {
    const names = new Set(excluded.map(optionalBookName).filter(Boolean));
    const result = [];
    for (const value of Array.isArray(values) ? values : []) {
        const name = optionalBookName(value);
        if (!name || names.has(name)) continue;
        names.add(name);
        result.push(name);
    }
    return result;
}

function scopeId(value) {
    return String(value ?? '').trim().slice(0, 512);
}

function assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, options = {}) {
    if (options.allowInactiveScope === true) return;
    const expected = scopeId(expectedScopeId);
    const session = options.scopeSession
        || (expected && typeof captureScopeSession === 'function' ? captureScopeSession(expected) : null);
    if (session) {
        if (scopeId(session.scopeId ?? session.scope?.scopeId) === expected && session.isCurrent?.()) return;
        throw new QQV2WorldbookGatewayError(
            'QQ 作用域已切换，当前世界书操作已取消',
            'worldbook_scope_inactive',
        );
    }
    if (expected && typeof captureScopeSession === 'function') {
        throw new QQV2WorldbookGatewayError(
            'QQ 作用域已切换，当前世界书操作已取消',
            'worldbook_scope_inactive',
        );
    }
    if (!expected || typeof getActiveScopeId !== 'function') return;
    let active = '';
    try {
        active = scopeId(getActiveScopeId());
    } catch {
        // A host transition is treated like an inactive scope.
    }
    if (active === expected) return;
    throw new QQV2WorldbookGatewayError(
        'QQ 作用域已切换，当前世界书操作已取消',
        'worldbook_scope_inactive',
    );
}

function resolveWorldbookContext(getContext) {
    let context = null;
    try {
        context = getContext();
    } catch {
        // The public error below keeps host implementation details out of QQ state.
    }
    if (!context
        || typeof context.loadWorldInfo !== 'function'
        || typeof context.saveWorldInfo !== 'function') {
        throw new QQV2WorldbookGatewayError(
            '当前 SillyTavern 上下文不能读写世界书',
            'worldbook_host_unavailable',
        );
    }
    return context;
}

/**
 * Production boundary for QQ projections. It deliberately resolves SillyTavern
 * context per operation because the host replaces context on chat switches.
 * A caller can bind the operation to a QQ scope so a late save cannot target
 * the new host context after an async boundary.
 */
export function createQQV2SillyTavernWorldbookGateway(options = {}) {
    const loaded = new Map();
    const getContext = typeof options.getContext === 'function'
        ? options.getContext
        : getFreshSillyTavernContext;
    const getActiveScopeId = typeof options.getActiveScopeId === 'function'
        ? options.getActiveScopeId
        : null;
    const captureScopeSession = typeof options.captureScopeSession === 'function'
        ? options.captureScopeSession
        : null;
    const listWorldbookNames = typeof options.getWorldbookNames === 'function'
        ? options.getWorldbookNames
        : () => getWorldbookNames({ strict: true });
    const readCurrentCharacterWorldbooks = typeof options.getCurrentCharacterWorldbooks === 'function'
        ? options.getCurrentCharacterWorldbooks
        : () => getCurrentCharacterWorldbooks({ strict: true });

    return Object.freeze({
        async listBookNames(expectedScopeId, operationOptions = {}) {
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            const names = uniqueBookNames(await listWorldbookNames());
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            return names;
        },
        async getCurrentCharacterBookNames(expectedScopeId, operationOptions = {}) {
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            const source = await readCurrentCharacterWorldbooks();
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            const primary = optionalBookName(source?.primary) || null;
            return {
                primary,
                additional: uniqueBookNames(source?.additional, primary ? [primary] : []),
            };
        },
        async loadBook(name, expectedScopeId, operationOptions = {}) {
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            const context = resolveWorldbookContext(getContext);
            const book = await context.loadWorldInfo(bookName(name));
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            if (book && options.mergeEntryChanges === true) loaded.set(JSON.stringify([name, expectedScopeId]), structuredClone(book));
            return book;
        },
        async saveBook(name, data, expectedScopeId, operationOptions = {}) {
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            const context = resolveWorldbookContext(getContext);
            const key = JSON.stringify([name, expectedScopeId]);
            const before = loaded.get(key);
            const result = await withWorldbookWrite(bookName(name), async () => {
                assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
                const current = before ? await context.loadWorldInfo(bookName(name)) : null;
                assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
                if (before && !current) throw new Error('目标世界书已被删除');
                const merged = before ? mergeWorldbookChanges(before, data, current) : data;
                const saved = await context.saveWorldInfo(bookName(name), merged, true);
                loaded.delete(key);
                return saved;
            });
            assertActiveScope(expectedScopeId, captureScopeSession, getActiveScopeId, operationOptions);
            return result;
        },
    });
}

export class QQV2WorldbookGatewayError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'QQV2WorldbookGatewayError';
        this.code = code;
    }
}
