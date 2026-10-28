import { t } from '../../i18n/index.js';
const LOCAL_NAVIGATION_REASONS = new Set(['conversation-opened']);
const asScopeId = result => String(result?.context?.scopeId || '').trim();

/** Owns one QQ page. Visibility suspends its view, never its business runtime. */
export function createQQRouteLifecycle({
    page, facade, createApp, shell = {}, isCurrent = () => true,
    isVisible = () => true, subscribeActivity = () => () => {},
} = {}) {
    if (!facade?.query || typeof createApp !== 'function') {
        throw new TypeError('QQ route lifecycle needs an injected Facade and root renderer');
    }
    let disposed = false;
    let app = null;
    let activeScopeId = '';
    let unsubscribe = null;
    let toastShown = false;
    let mountRequested = false;
    let refreshPending = false;
    let refreshPromise = null;
    let visibilityEpoch = 0;
    let pageWasConnected = page?.isConnected === true;
    let cancelMount;
    const cancelled = new Promise(resolve => { cancelMount = resolve; });
    const isActive = () => !disposed && isCurrent() === true;
    // A new route page is populated before its scheduled DOM commit. Detachment alone is not invisibility.
    const canRender = () => isActive() && isVisible() === true;
    const defer = () => { if (isActive()) refreshPending = true; };
    const showToastOnce = () => {
        if (toastShown || !canRender()) return;
        toastShown = true;
        try { shell.showToast?.(t("QQ 暂时无法加载")); } catch { /* Advisory only. */ }
    };
    const showReadFailure = () => {
        if (!canRender()) return;
        page?.replaceChildren?.();
        showToastOnce();
        cancelMount(false);
    };
    const bindSubscription = async () => {
        if (typeof facade.subscribe !== 'function') return;
        try {
            const cleanup = await facade.subscribe(event => {
                if (page?.isConnected === true) pageWasConnected = true;
                if (LOCAL_NAVIGATION_REASONS.has(String(event?.reason || '').trim())
                    || String(event?.scopeId || '').trim() !== activeScopeId || !isActive()
                    || (pageWasConnected && page?.isConnected === false)) return Promise.resolve();
                // A local mutation can update its mounted view without a second full redraw.
                if (app?.handleChange?.(event) === true) return Promise.resolve();
                defer();
                return drain();
            });
            if (!isActive()) { cleanup?.(); return; }
            unsubscribe = typeof cleanup === 'function' ? cleanup : null;
        } catch { if (canRender()) showReadFailure(); }
    };
    const drain = () => {
        if (refreshPromise) return refreshPromise;
        if (!mountRequested || !refreshPending || !canRender()) return Promise.resolve(false);
        refreshPromise = (async () => {
            while (refreshPending && canRender()) {
                refreshPending = false;
                const epoch = visibilityEpoch;
                try {
                    const snapshot = await (typeof facade.query.currentContext === 'function'
                        ? facade.query.currentContext()
                        : facade.query.bootstrap?.());
                    if (!isActive()) return false;
                    if (epoch !== visibilityEpoch || !canRender()) { defer(); continue; }
                    if (snapshot?.ok !== true) { showReadFailure(); continue; }
                    if (app) {
                        if (asScopeId(snapshot) === activeScopeId) await app.refresh?.();
                    } else {
                        activeScopeId = asScopeId(snapshot);
                        app = createApp({ facade, shell, scopeId: activeScopeId,
                            isCurrent: isActive, isVisible: canRender, onDeferredRender: defer,
                            onRefreshRequested: () => { defer(); return drain(); },
                            onError: showToastOnce,
                        });
                        try { app.mount(page); } catch (error) { app.destroy?.(); app = null; throw error; }
                        if (!isActive()) { app.destroy?.(); app = null; return false; }
                        void bindSubscription();
                    }
                } catch {
                    if (epoch !== visibilityEpoch || !canRender()) { defer(); continue; }
                    showReadFailure();
                }
            }
            return !!app;
        })().finally(() => {
            refreshPromise = null;
            // A notification can arrive between the loop completing and this microtask.
            if (refreshPending && canRender()) void drain();
        });
        return refreshPromise;
    };
    const stopActivity = subscribeActivity(() => {
        if (!isActive()) return;
        if (!isVisible()) {
            visibilityEpoch += 1;
            app?.suspend?.();
            if (refreshPromise || !app) defer();
        } else if (mountRequested) {
            void drain();
        }
    });
    return Object.freeze({
        mount() {
            mountRequested = true;
            defer();
            const waitForReady = async () => {
                if (!await drain() || !isActive()) return false;
                const mountedApp = app;
                const ready = await (mountedApp.whenReady?.() ?? true);
                if (!isActive() || app !== mountedApp) return false;
                if (ready !== true) { showReadFailure(); return false; }
                await drain();
                return isActive() && app === mountedApp && isVisible() === true;
            };
            return Promise.race([waitForReady(), cancelled]);
        },
        destroy() {
            if (disposed) return;
            disposed = true;
            cancelMount(false);
            visibilityEpoch += 1;
            refreshPending = false;
            try { stopActivity?.(); } finally {
                try { unsubscribe?.(); } finally { unsubscribe = null; app?.destroy?.(); app = null; }
            }
        },
    });
}
