import { t } from '../i18n/index.js';
import {
    createStableImageOwnershipTarget,
    validateStableImageOwnershipTarget,
} from './stable-image-ownership.js';

const GENERATED_IMAGE_FOLDER = 'yuzi-phone-generated';

function text(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

function plainText(value) {
    return String(value ?? '').trim();
}

function copyCanvas(canvas) {
    if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) return null;
    const id = text(canvas.id ?? canvas.canvas ?? canvas.name);
    const tableName = text(canvas.tableName);
    const stableIdentityFields = Array.isArray(canvas.stableIdentityFields)
        ? canvas.stableIdentityFields.map(text)
        : [];
    const promptFields = Array.isArray(canvas.promptFields)
        ? canvas.promptFields.map(text)
        : [];
    if (!id || !tableName || stableIdentityFields.length === 0
        || stableIdentityFields.some(field => !field)
        || new Set(stableIdentityFields).size !== stableIdentityFields.length
        || promptFields.some(field => !field)
        || new Set(promptFields).size !== promptFields.length) {
        return null;
    }
    return {
        id,
        tableName,
        stableIdentityFields,
        promptFields,
    };
}

function valuesForFields(rowValues, fields) {
    if (Array.isArray(rowValues)) return rowValues.length === fields.length ? [...rowValues] : null;
    if (!rowValues || typeof rowValues !== 'object') return null;
    return fields.map(field => rowValues[field]);
}

function promptValuesForFields(rowValues, fields) {
    if (!rowValues || typeof rowValues !== 'object' || Array.isArray(rowValues)) return null;
    return Object.fromEntries(fields.map(field => [field, rowValues[field]]));
}

function targetContext(input = {}) {
    const canvas = copyCanvas(input.canvas);
    if (!canvas) return { ok: false, reason: 'canvas-invalid' };

    let target;
    try {
        target = createStableImageOwnershipTarget({
            chatScope: input.chatScope,
            physicalTable: canvas.tableName,
            identityFields: canvas.stableIdentityFields,
            identityValues: valuesForFields(input.rowValues, canvas.stableIdentityFields),
            canvas: canvas.id,
        });
    } catch (_error) {
        return { ok: false, reason: 'target-invalid' };
    }

    const candidateRows = Array.isArray(input.candidateRows) ? input.candidateRows : null;
    const identityCandidates = candidateRows?.map(row => (
        valuesForFields(row, canvas.stableIdentityFields)
    ));
    return {
        ok: true,
        canvas,
        target,
        identityCandidates,
        promptValues: promptValuesForFields(input.rowValues, canvas.promptFields),
    };
}

function invalidTargetResult(reason) {
    return { ok: false, status: 'invalid-target', reason };
}

function failureResult(generation, previousImagePath) {
    return {
        ok: false,
        status: 'failed',
        reason: 'image-generation-failed',
        previousImagePath,
        generation,
    };
}

/**
 * Connects declared table-display canvases to the shared image orchestrator.
 * It reads only values supplied by the caller and never reads content presets,
 * table snapshots, DOM, or SillyTavern state itself.
 */
export function createTableDisplayImageGenerationService(options = {}) {
    const orchestrator = options.orchestrator;
    const ownershipService = options.ownershipService;
    const isTableEnabled = options.isTableEnabled;
    const isCurrentTarget = options.isCurrentTarget;
    const defaultComposePrompt = typeof options.composePrompt === 'function'
        ? options.composePrompt
        : null;

    if (!orchestrator || typeof orchestrator.generate !== 'function') {
        throw new TypeError(t("表格展示生图服务需要共享 orchestrator.generate"));
    }
    if (!ownershipService || typeof ownershipService.beginReplacement !== 'function'
        || typeof ownershipService.commitReplacement !== 'function'
        || typeof ownershipService.read !== 'function'
        || typeof ownershipService.invalidate !== 'function'
        || typeof ownershipService.invalidateChatScope !== 'function') {
        throw new TypeError(t("表格展示生图服务需要完整的稳定图片归属服务"));
    }
    if (typeof isTableEnabled !== 'function') {
        throw new TypeError(t("表格展示生图服务需要 isTableEnabled 表级开关"));
    }
    if (typeof isCurrentTarget !== 'function') {
        throw new TypeError(t("表格展示生图服务需要 isCurrentTarget 归属复核"));
    }

    const inFlight = new Map();
    const listeners = new Set();
    const staleResult = () => ({ ok: false, status: 'stale', reason: 'ticket-invalid' });

    function publish(target, result) {
        const request = inFlight.get(target.key);
        const detail = Object.freeze({
            target,
            busy: Boolean(request),
            generating: request?.operation === 'generate',
            ...(result ? { result: Object.freeze({ ...result }) } : {}),
        });
        for (const listener of [...listeners]) {
            try { listener(detail); } catch { /* A view cannot interrupt another view or saving. */ }
        }
    }

    function finishRequest(request, result) {
        if (inFlight.get(request.target.key) !== request) return;
        inFlight.delete(request.target.key);
        request.signal?.removeEventListener('abort', request.cancel);
        if (result?.ok !== true) ownershipService.invalidate(request.target);
        publish(request.target, result);
    }

    async function runOperation(context, operation, signal, work) {
        if (inFlight.has(context.target.key)) {
            return { ok: false, status: 'busy', reason: 'generation-in-progress' };
        }
        signal ||= options.getSessionSignal?.();
        if (signal?.aborted) return staleResult();
        const request = { target: context.target, operation, signal };
        request.cancel = () => finishRequest(request, staleResult());
        const isCurrent = () => inFlight.get(context.target.key) === request && !signal?.aborted;
        inFlight.set(context.target.key, request);
        signal?.addEventListener('abort', request.cancel, { once: true });
        publish(context.target);
        let result;
        try {
            result = await work({ isCurrent, signal });
            return result;
        } catch {
            result = { ok: false, status: 'failed', reason: operation === 'generate' ? 'image-generation-failed' : 'image-storage-failed' };
            return result;
        } finally {
            finishRequest(request, result);
        }
    }

    async function composeNaturalPrompt(input, context) {
        const supplied = plainText(input.naturalPrompt);
        if (supplied) return { ok: true, naturalPrompt: supplied };

        const composePrompt = typeof input.composePrompt === 'function'
            ? input.composePrompt
            : defaultComposePrompt;
        if (!composePrompt || !context.promptValues) {
            return { ok: false, reason: 'natural-prompt-required' };
        }
        try {
            const naturalPrompt = plainText(await composePrompt({
                canvas: input.canvas,
                chatScope: context.target.chatScope,
                promptValues: context.promptValues,
            }));
            return naturalPrompt
                ? { ok: true, naturalPrompt }
                : { ok: false, reason: 'natural-prompt-required' };
        } catch (_error) {
            return { ok: false, reason: 'prompt-compose-failed' };
        }
    }

    async function generate(input = {}) {
        const context = targetContext(input);
        if (!context.ok) return invalidTargetResult(context.reason);

        const validation = validateStableImageOwnershipTarget({
            target: context.target,
            identityCandidates: context.identityCandidates,
        });
        if (!validation.ok) return invalidTargetResult(validation.reason);

        return runOperation(context, 'generate', input.signal, async ({ isCurrent, signal }) => {
            let enabled;
            try {
                enabled = await isTableEnabled({ chatScope: context.target.chatScope, tableName: context.canvas.tableName, canvas: input.canvas });
            } catch { enabled = false; }
            if (!isCurrent()) return staleResult();
            if (enabled !== true) return { ok: false, status: 'disabled', reason: 'table-disabled' };
            const prompt = await composeNaturalPrompt(input, context);
            if (!isCurrent()) return staleResult();
            if (!prompt.ok) return { ok: false, status: 'invalid-input', reason: prompt.reason };
            const started = await ownershipService.beginReplacement({
                target: context.target,
                identityCandidates: context.identityCandidates,
                isCurrent,
            });
            if (!started.ok) return started;
            if (!isCurrent()) return staleResult();

            let generation;
            try {
                generation = await orchestrator.generate({
                    ...(input.generation && typeof input.generation === 'object' ? input.generation : {}),
                    naturalPrompt: prompt.naturalPrompt,
                    folder: GENERATED_IMAGE_FOLDER,
                    ...(signal ? { signal } : {}),
                });
            } catch (_error) {
                generation = {
                    ok: false,
                    status: 'failed',
                    error: { code: 'image-generation-failed' },
                };
            }
            if (!isCurrent()) return { ...staleResult(), previousImagePath: started.previousImagePath };
            const imagePath = plainText(generation?.path);
            if (generation?.ok !== true || !imagePath) {
                return failureResult(generation, started.previousImagePath);
            }

            const committed = await ownershipService.commitReplacement({
                ticket: started.ticket,
                imagePath,
                recheckOwnership: async target => isCurrent() && await isCurrentTarget({
                    target,
                    canvas: input.canvas,
                    chatScope: context.target.chatScope,
                    rowValues: input.rowValues,
                    candidateRows: input.candidateRows,
                    requestContext: input.requestContext,
                }) && isCurrent(),
            });
            if (!committed.ok) {
                return { ...committed, previousImagePath: started.previousImagePath };
            }
            return {
                ok: true,
                status: 'generated',
                target: committed.record,
                imagePath: committed.record.imagePath,
                previousImagePath: committed.previousImagePath,
                record: committed.record,
            };
        });
    }

    // Upload and clear share exactly the same stable target and lock as generation.
    // Clear removes the association, not the shared file from disk.
    async function replaceImage(input = {}, clear = false) {
        const context = targetContext(input);
        if (!context.ok) return invalidTargetResult(context.reason);
        const validation = validateStableImageOwnershipTarget({ target: context.target, identityCandidates: context.identityCandidates });
        if (!validation.ok) return invalidTargetResult(validation.reason);
        if (!clear && typeof options.storeImage !== 'function') return { ok: false, status: 'unavailable', reason: 'image-storage-unavailable' };
        return runOperation(context, clear ? 'delete' : 'save', input.signal, async ({ isCurrent }) => {
            const started = await ownershipService.beginReplacement({ target: context.target, identityCandidates: context.identityCandidates, isCurrent });
            if (!started.ok) return started;
            if (!isCurrent()) return staleResult();
            let imagePath = '';
            if (!clear) {
                const stored = await options.storeImage(input.image);
                if (!stored?.ok || !plainText(stored.path)) return { ok: false, status: 'failed', reason: 'image-storage-failed', previousImagePath: started.previousImagePath };
                imagePath = plainText(stored.path);
            }
            const committed = await ownershipService.commitReplacement({
                ticket: started.ticket, imagePath, clear,
                recheckOwnership: async target => isCurrent() && await isCurrentTarget({ target, canvas: input.canvas, chatScope: context.target.chatScope, rowValues: input.rowValues, requestContext: input.requestContext }) && isCurrent(),
            });
            if (!committed.ok) return { ...committed, previousImagePath: started.previousImagePath };
            return { ok: true, status: clear ? 'deleted' : 'saved', imagePath, previousImagePath: committed.previousImagePath, record: committed.record };
        });
    }

    async function read(input = {}) {
        const context = targetContext(input);
        return context.ok ? ownershipService.read(context.target) : null;
    }

    function invalidate(input = {}) {
        const context = targetContext(input);
        if (!context.ok) return false;
        const request = inFlight.get(context.target.key);
        if (request) request.cancel();
        else ownershipService.invalidate(context.target);
        return true;
    }

    function invalidateChatScope(chatScope) {
        const scope = plainText(chatScope);
        for (const request of [...inFlight.values()]) {
            if (request.target.chatScope === scope) request.cancel();
        }
        ownershipService.invalidateChatScope(scope);
    }

    return Object.freeze({
        generate,
        save: input => replaceImage(input),
        delete: input => replaceImage(input, true),
        read,
        getState(input = {}) {
            const context = targetContext(input);
            const request = context.ok ? inFlight.get(context.target.key) : null;
            return Object.freeze({ key: context.ok ? context.target.key : '', busy: Boolean(request), generating: request?.operation === 'generate' });
        },
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        invalidate,
        invalidateChatScope,
    });
}
