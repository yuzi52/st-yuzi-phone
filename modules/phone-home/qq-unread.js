export const HOME_QQ_UNREAD_PROJECTION_KEY = '__yuziHomeQQUnreadProjection';

function asScopeId(value) {
    return String(value ?? '').trim();
}

export function normalizeQQHomeUnreadTotal(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function formatQQHomeUnreadBadge(total) {
    const normalized = normalizeQQHomeUnreadTotal(total);
    if (normalized === 0) return '';
    return normalized > 99 ? '99+' : String(normalized);
}

function extractScopeId(snapshot) {
    if (snapshot?.ok !== true) return '';
    return asScopeId(snapshot?.context?.scopeId);
}

function extractUnreadTotal(result) {
    if (result?.ok !== true) return null;
    return normalizeQQHomeUnreadTotal(result?.unread?.total);
}

/**
 * Keeps the home QQ icon aligned with the Facade-owned unread state. Each read
 * verifies its scope after completion so an old chat cannot paint a new home.
 */
export function createQQHomeUnreadProjection({ facade, onChange, onDestroy } = {}) {
    let disposed = false;
    let started = false;
    let activeScopeId = '';
    let subscribedScopeId = '';
    let total = 0;
    let unsubscribe = null;
    let readVersion = 0;
    let subscriptionVersion = 0;
    let changeListener = typeof onChange === 'function' ? onChange : null;

    const isActive = () => !disposed;

    const notify = () => {
        try {
            changeListener?.(total);
        } catch {
            // A home repaint failure cannot break QQ runtime notifications.
        }
    };

    const setTotal = (nextTotal) => {
        const normalized = normalizeQQHomeUnreadTotal(nextTotal);
        if (total === normalized) return false;
        total = normalized;
        notify();
        return true;
    };

    const resolveScope = async () => {
        const query = facade?.query;
        const readContext = typeof query?.currentContext === 'function' ? query.currentContext : query?.bootstrap;
        if (typeof readContext !== 'function') return '';
        try {
            return extractScopeId(await readContext.call(query));
        } catch {
            return '';
        }
    };

    const clearSubscription = () => {
        const currentUnsubscribe = unsubscribe;
        unsubscribe = null;
        subscribedScopeId = '';
        if (typeof currentUnsubscribe === 'function') {
            try {
                currentUnsubscribe();
            } catch {
                // Subscription cleanup is best-effort.
            }
        }
    };

    const bindSubscription = async (scopeId) => {
        const normalizedScopeId = asScopeId(scopeId);
        const version = ++subscriptionVersion;
        clearSubscription();
        if (!isActive() || !normalizedScopeId || typeof facade?.subscribe !== 'function') return false;

        let nextUnsubscribe = null;
        try {
            nextUnsubscribe = await facade.subscribe((event) => {
                if (!isActive() || asScopeId(event?.scopeId) !== activeScopeId) return;
                void refresh(activeScopeId);
            });
        } catch {
            return false;
        }

        if (!isActive() || version !== subscriptionVersion || activeScopeId !== normalizedScopeId) {
            try {
                nextUnsubscribe?.();
            } catch {
                // A late Facade subscription is simply discarded.
            }
            return false;
        }

        unsubscribe = typeof nextUnsubscribe === 'function' ? nextUnsubscribe : null;
        subscribedScopeId = normalizedScopeId;
        return true;
    };

    const switchScope = async (nextScopeId) => {
        const normalizedScopeId = asScopeId(nextScopeId);
        const changed = activeScopeId !== normalizedScopeId;
        activeScopeId = normalizedScopeId;
        if (changed) setTotal(0);
        if (subscribedScopeId !== normalizedScopeId) {
            await bindSubscription(normalizedScopeId);
        }
        return Boolean(normalizedScopeId);
    };

    const refresh = async (expectedScopeId = '') => {
        if (!isActive()) return false;
        const version = ++readVersion;
        const expected = asScopeId(expectedScopeId);
        const beforeScopeId = await resolveScope();
        if (!isActive() || version !== readVersion) return false;

        if (!beforeScopeId) {
            await switchScope('');
            return false;
        }

        if (beforeScopeId !== activeScopeId || (expected && beforeScopeId !== expected)) {
            await switchScope(beforeScopeId);
            if (!isActive() || version !== readVersion) return false;
        }

        if (typeof facade?.query?.unread !== 'function') return false;
        let unreadResult;
        try {
            unreadResult = await facade.query.unread();
        } catch {
            return false;
        }

        const afterScopeId = await resolveScope();
        if (!isActive() || version !== readVersion) return false;
        if (afterScopeId !== beforeScopeId) {
            await switchScope(afterScopeId);
            if (isActive() && afterScopeId) void refresh(afterScopeId);
            return false;
        }

        const nextTotal = extractUnreadTotal(unreadResult);
        if (nextTotal === null) return false;
        setTotal(nextTotal);
        return true;
    };

    return Object.freeze({
        async start() {
            if (disposed) return false;
            if (started) return refresh(activeScopeId);
            started = true;
            const initialScopeId = await resolveScope();
            if (!isActive() || !initialScopeId) return false;
            await switchScope(initialScopeId);
            return refresh(initialScopeId);
        },
        refresh,
        getTotal: () => total,
        isDisposed: () => disposed,
        setOnChange(nextOnChange) {
            changeListener = typeof nextOnChange === 'function' ? nextOnChange : null;
            if (isActive() && changeListener) notify();
        },
        destroy() {
            if (disposed) return;
            disposed = true;
            readVersion += 1;
            subscriptionVersion += 1;
            clearSubscription();
            try {
                onDestroy?.();
            } catch {
                // Host cleanup must never throw during route disposal.
            }
        },
    });
}

export function ensureQQHomeUnreadProjection({ container, facade, runtime, onChange } = {}) {
    if (!container || typeof container !== 'object') return null;
    const host = /** @type {Record<string, unknown>} */ (container);
    const existing = host[HOME_QQ_UNREAD_PROJECTION_KEY];
    if (existing && typeof existing.isDisposed === 'function' && !existing.isDisposed()) {
        existing.setOnChange?.(onChange);
        return existing;
    }

    const projection = createQQHomeUnreadProjection({
        facade,
        onChange,
        onDestroy: () => {
            if (host[HOME_QQ_UNREAD_PROJECTION_KEY] === projection) {
                delete host[HOME_QQ_UNREAD_PROJECTION_KEY];
            }
        },
    });
    host[HOME_QQ_UNREAD_PROJECTION_KEY] = projection;
    runtime?.registerCleanup?.(() => projection.destroy());
    void projection.start();
    return projection;
}
