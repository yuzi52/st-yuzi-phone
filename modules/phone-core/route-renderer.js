import { t } from '../i18n/index.js';
import { Logger } from '../error-handler.js';
import { tryRenderContentPreset } from '../content-presets/renderer.js';
import { resolveContentPresetRouteTarget } from '../content-presets/route-target.js';
import { discardPendingTableReviewNavigationIntent } from '../table-update-review/navigation-intent.js';
import { isTheaterRoute, normalizeTheaterSceneId } from '../phone-theater/config.js';
import { registerRoutePageCleanup, removeRoutePage } from './route-page-lifecycle.js';
import { clearRouteHistory } from './routing.js';
import { bindPhoneScrollGuards, hardenPhoneInteractionDefaults, logRouteScrollDebugSnapshot } from './scroll-guards.js';
import { getPhoneCoreState, markPhoneRouteRefreshPending, phoneRuntime, subscribePhoneActivity } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/route-renderer', feature: 'route' });
const TABLE_GENERIC_ROUTE_PREFIX = 'table-generic:';
const TABLE_ROUTE_PREFIX = 'table:';
let pendingQQRoute = null;
const cancelledQQPages = new WeakSet();

function trackPendingQQRoute(page) {
    pendingQQRoute?.cancel();
    let resolveCancelled;
    let unregisterRuntime = () => {};
    let unsubscribeActivity = () => {};
    const candidate = {
        page,
        cancelled: new Promise(resolve => { resolveCancelled = resolve; }),
        cancel: () => removeRoutePage(page),
        release() {
            unregisterRuntime();
            unsubscribeActivity();
            if (pendingQQRoute === candidate) pendingQQRoute = null;
        },
    };
    registerRoutePageCleanup(page, () => {
        cancelledQQPages.add(page);
        resolveCancelled(false);
        candidate.release();
    });
    pendingQQRoute = candidate;
    unsubscribeActivity = subscribePhoneActivity(active => {
        if (active) return;
        deferInactivePhoneRouteRender();
        candidate.cancel();
    });
    unregisterRuntime = phoneRuntime.registerCleanup(candidate.cancel);
    return candidate;
}

function isActiveRouteRender(renderToken, state = getPhoneCoreState()) {
    if (!Number.isFinite(renderToken)) {
        return !state.isDestroying;
    }

    return !state.isDestroying && state.routeRenderToken === renderToken;
}

function isRenderableScreen(screen, renderToken, state = getPhoneCoreState()) {
    return screen instanceof HTMLElement
        && screen.isConnected
        && state.isPhoneActive !== false
        && isActiveRouteRender(renderToken, state);
}

function deferInactivePhoneRouteRender(state = getPhoneCoreState()) {
    if (state.isDestroying || state.isPhoneActive !== false) return false;
    markPhoneRouteRefreshPending('route-render-inactive', state);
    return true;
}

function showDefaultQQRouteToast(message, isError = true) {
    const container = getPhoneCoreState().phoneContainer;
    if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) return;
    if (container.querySelector('[data-qq-route-toast]')) return;

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.dataset.qqRouteToast = '1';
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    (container.querySelector('.yuzi-phone-shell') || container).append(toast);
    phoneRuntime.setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    phoneRuntime.setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        phoneRuntime.setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function resolveQQRouteShell(deps = {}) {
    if (typeof deps.getQQRouteShell === 'function') {
        return deps.getQQRouteShell() || {};
    }
    return Object.freeze({ showToast: showDefaultQQRouteToast });
}

function showQQRouteFailure(shell) {
    try {
        shell?.showToast?.(t("QQ 暂时无法加载"));
    } catch {
        // Error notification is advisory; the previous page remains usable.
    }
}

async function loadQQRouteDependencies(deps = {}) {
    if (typeof deps.loadQQRouteDependencies === 'function') {
        return deps.loadQQRouteDependencies();
    }

    const [{ createQQApp }, { createQQRouteLifecycle }, { getQQV2Facade }] = await Promise.all([
        import('../qq-v2/ui/app.js'),
        import('../qq-v2/ui/route-lifecycle.js'),
        import('../qq-v2/runtime/default-runtime.js'),
    ]);
    return { createQQApp, createQQRouteLifecycle, getQQV2Facade };
}

async function loadTableRouteDependencies(deps = {}) {
    const [dataApi, navigationApi] = await Promise.all([
        typeof deps.getTableData === 'function' ? null : import('./data-api.js'),
        typeof deps.buildTableNavigationContext === 'function'
            && typeof deps.resolveTableNavigationTarget === 'function'
            ? null
            : import('../table-navigation/catalog.js'),
    ]);
    return {
        getTableData: deps.getTableData || dataApi.getTableData,
        buildTableNavigationContext: deps.buildTableNavigationContext
            || navigationApi.buildTableNavigationContext,
        resolveTableNavigationTarget: deps.resolveTableNavigationTarget
            || navigationApi.resolveTableNavigationTarget,
    };
}

export function __test__discardReviewNavigationAttemptForRoute(route, opts = {}) {
    if (!String(route || '').startsWith(TABLE_ROUTE_PREFIX)) return false;
    const sheetKey = String(route).slice(TABLE_ROUTE_PREFIX.length).trim();
    const attemptId = String(opts.reviewNavigationAttemptId || '').trim();
    if (!sheetKey || !attemptId) return false;
    return discardPendingTableReviewNavigationIntent(sheetKey, attemptId);
}

async function loadRouteRenderer(route, renderToken, deps = {}, opts = {}) {
    if (route === 'home') {
        const { renderHomeScreen } = await import('../phone-home/render.js');
        return {
            routeType: 'home',
            render(page) {
                clearRouteHistory();
                renderHomeScreen(page);
            },
        };
    }

    if (route === 'qq' || route.startsWith('qq:')) {
        return {
            routeType: 'qq',
            render(page) {
                const shell = resolveQQRouteShell(deps);
                let lifecycle = null;
                let disposed = false;
                registerRoutePageCleanup(page, () => {
                    disposed = true;
                    lifecycle?.destroy();
                });
                const pending = trackPendingQQRoute(page);

                const prepare = async () => {
                    try {
                        if (disposed) return false;
                        const qqDependencies = await loadQQRouteDependencies(deps);
                        if (disposed) return false;
                        const getFacade = typeof deps.getQQV2Facade === 'function'
                            ? deps.getQQV2Facade
                            : qqDependencies.getQQV2Facade;
                        const facade = getFacade?.();
                        if (!facade) {
                            showQQRouteFailure(shell);
                            pending.cancel();
                            return false;
                        }

                        lifecycle = qqDependencies.createQQRouteLifecycle({
                            page,
                            facade,
                            createApp: qqDependencies.createQQApp,
                            shell,
                            isCurrent: () => !disposed && isActiveRouteRender(renderToken),
                            isVisible: () => getPhoneCoreState().isPhoneActive !== false,
                            subscribeActivity: subscribePhoneActivity,
                        });
                        if (disposed) {
                            lifecycle.destroy();
                            return false;
                        }
                        const ready = await lifecycle.mount();
                        if (!ready || disposed) { pending.cancel(); return false; }
                        return true;
                    } catch {
                        if (!disposed) showQQRouteFailure(shell);
                        pending.cancel();
                        return false;
                    }
                };
                return Promise.race([prepare(), pending.cancelled]);
            },
        };
    }

    if (route === 'table-update-review') {
        const { renderTableUpdateReview } = await import('../table-update-review/index.js');
        return {
            routeType: 'table-update-review',
            render(page) {
                renderTableUpdateReview(page, { renderToken });
            },
        };
    }

    if (route.startsWith(TABLE_ROUTE_PREFIX)) {
        const sheetKey = route.slice(TABLE_ROUTE_PREFIX.length).trim();
        if (!sheetKey) return null;

        const {
            getTableData,
            buildTableNavigationContext,
            resolveTableNavigationTarget,
        } = await loadTableRouteDependencies(deps);
        const initialTableData = getTableData();
        const navigationContext = buildTableNavigationContext(initialTableData);
        const target = resolveTableNavigationTarget(initialTableData, sheetKey, { navigationContext });
        if (!target) return null;

        if (target.presentation === 'theater') {
            const { renderTheaterScene } = deps.renderTheaterScene
                ? { renderTheaterScene: deps.renderTheaterScene }
                : await import('../phone-theater/render.js');
            const originalRenderer = (page) => {
                renderTheaterScene(page, target.sceneId, {
                    renderToken,
                    navigationSheetKey: target.sheetKey,
                    initialTableData,
                    initialNavigationContext: navigationContext,
                });
                if (opts.reviewNavigationAttemptId) discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId);
            };
            return {
                routeType: 'table-theater',
                async render(page) {
                    const presetTarget = resolveContentPresetRouteTarget(route, initialTableData, { navigationContext });
                    const renderPreset = deps.tryRenderContentPreset || tryRenderContentPreset;
                    if (!await renderPreset(page, presetTarget, {
                        renderToken,
                        originalRenderer,
                        initialTableData,
                        onCommitted: () => discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId),
                    })) originalRenderer(page);
                },
            };
        }

        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        const originalRenderer = (page) => {
            const viewerOptions = {
                forceGenericList: target.presentation === 'generic',
                navigationSheetKey: target.sheetKey,
                initialTableData,
                initialNavigationContext: navigationContext,
            };
            if (opts.reviewNavigationAttemptId) {
                viewerOptions.reviewNavigationAttemptId = opts.reviewNavigationAttemptId;
            }
            renderTableViewer(page, target.sheetKey, viewerOptions);
        };
        return {
            routeType: 'table-generic-auto',
            async render(page) {
                const presetTarget = resolveContentPresetRouteTarget(route, initialTableData, { navigationContext });
                const renderPreset = deps.tryRenderContentPreset || tryRenderContentPreset;
                if (!await renderPreset(page, presetTarget, {
                    renderToken,
                    originalRenderer,
                    initialTableData,
                    onCommitted: () => discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId),
                })) originalRenderer(page);
            },
        };
    }

    if (route.startsWith('app:')) {
        const sheetKey = route.replace('app:', '').trim();
        const {
            getTableData,
            buildTableNavigationContext,
            resolveTableNavigationTarget,
        } = await loadTableRouteDependencies(deps);
        const initialTableData = getTableData();
        const navigationContext = buildTableNavigationContext(initialTableData);
        const target = resolveTableNavigationTarget(initialTableData, sheetKey, { navigationContext });
        if (target?.presentation === 'theater') {
            const { renderTheaterScene } = deps.renderTheaterScene
                ? { renderTheaterScene: deps.renderTheaterScene }
                : await import('../phone-theater/render.js');
            const originalRenderer = (page) => renderTheaterScene(page, target.sceneId, {
                renderToken,
                navigationSheetKey: target.sheetKey,
                initialTableData,
                initialNavigationContext: navigationContext,
            });
            return {
                routeType: 'theater-app-redirect',
                render: originalRenderer,
            };
        }

        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        const originalRenderer = (page) => renderTableViewer(page, sheetKey, {
            ...(target ? { navigationSheetKey: target.sheetKey } : {}),
            initialTableData,
            initialNavigationContext: navigationContext,
        });
        return {
            routeType: 'app',
            render: originalRenderer,
        };
    }

    if (route.startsWith(TABLE_GENERIC_ROUTE_PREFIX)) {
        const sheetKey = route.slice(TABLE_GENERIC_ROUTE_PREFIX.length).trim();
        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        return {
            routeType: 'table-generic',
            render(page) {
                const viewerOptions = { forceGenericList: true };
                if (opts.reviewNavigationAttemptId) viewerOptions.reviewNavigationAttemptId = opts.reviewNavigationAttemptId;
                renderTableViewer(page, sheetKey, viewerOptions);
            },
        };
    }

    if (isTheaterRoute(route)) {
        const sceneId = normalizeTheaterSceneId(route);
        const { renderTheaterScene } = deps.renderTheaterScene
            ? { renderTheaterScene: deps.renderTheaterScene }
            : await import('../phone-theater/render.js');
        const originalRenderer = (page) => renderTheaterScene(page, sceneId, { renderToken });
        return {
            routeType: 'theater',
            render: originalRenderer,
        };
    }

    if (route === 'settings') {
        const renderSettings = typeof deps.renderSettings === 'function'
            ? deps.renderSettings
            : (await import('../settings-app/render.js')).renderSettings;
        return {
            routeType: 'settings',
            render(page) {
                const dispose = renderSettings(page);
                if (typeof dispose === 'function') {
                    registerRoutePageCleanup(page, dispose);
                }
            },
        };
    }

    if (route === 'fusion') {
        const { renderFusion } = await import('../phone-fusion/render.js');
        return {
            routeType: 'fusion',
            render(page) {
                renderFusion(page);
            },
        };
    }

    if (route === 'variable-manager') {
        const { renderVariableManager } = await import('../variable-manager/index.js');
        return {
            routeType: 'variable-manager',
            render(page) {
                renderVariableManager(page, { renderToken });
            },
        };
    }

    return null;
}

export function __test__loadRouteRenderer(route, renderToken, deps = {}, opts = {}) {
    return loadRouteRenderer(route, renderToken, deps, opts);
}

async function resolveRouteRenderer(route, renderToken, opts = {}) {
    try {
        const routeRenderer = await loadRouteRenderer(route, renderToken, {}, opts);
        if (!routeRenderer) {
            logger.warn({
                action: 'resolve',
                message: '未知 route，跳过渲染',
                context: { route, renderToken },
            });
            return null;
        }

        return routeRenderer;
    } catch (error) {
        logger.error({
            action: 'resolve',
            message: '加载 route renderer 失败',
            context: { route, renderToken },
            error,
        });
        return null;
    }
}

function createRoutePage() {
    const page = document.createElement('div');
    page.className = 'phone-page';
    return page;
}

function getRoutePages(screen) {
    if (!(screen instanceof HTMLElement)) {
        return [];
    }

    return Array.from(screen.children)
        .filter((child) => child instanceof HTMLElement && child.classList.contains('phone-page'));
}

function removeStaleRoutePages(screen, retainedPages = []) {
    const retainedPageSet = new Set(retainedPages.filter((page) => page instanceof HTMLElement));

    for (const routePage of getRoutePages(screen)) {
        if (retainedPageSet.has(routePage)) continue;
        routePage.setAttribute('aria-hidden', 'true');
        removeRoutePage(routePage);
    }
}

function createRouteRenderContext(route, opts = {}, state = getPhoneCoreState()) {
    const screen = document.querySelector('.yuzi-phone-screen');
    if (!(screen instanceof HTMLElement)) {
        logger.debug({
            action: 'context.skip',
            message: 'route 渲染跳过：phone screen 不存在',
            context: { route },
        });
        return null;
    }

    const renderToken = Number.isFinite(opts.renderToken)
        ? opts.renderToken
        : state.routeRenderToken;
    if (state.isDestroying || state.isPhoneActive === false || !isActiveRouteRender(renderToken, state)) {
        logger.debug({
            action: 'context.skip',
            message: 'route 渲染跳过：render token 已过期或 runtime 正在销毁',
            context: { route, renderToken },
        });
        return null;
    }

    const page = createRoutePage();
    page.dataset.yuziPhoneRoute = route;
    return {
        route,
        state,
        screen,
        renderToken,
        page,
    };
}

async function renderResolvedRoutePage(routeRenderer, context) {
    try {
        return await routeRenderer.render(context.page) !== false && !cancelledQQPages.has(context.page);
    } catch (error) {
        logger.error({
            action: 'render',
            message: 'route 页面渲染失败',
            context: {
                route: context.route,
                renderToken: context.renderToken,
            },
            error,
        });
        return false;
    }
}

function commitRoutePage({ screen, page, route, renderToken, opts }) {
    if (cancelledQQPages.has(page) || !isRenderableScreen(screen, renderToken)) {
        logger.warn({
            action: 'commit.skip',
            message: 'route 页面提交跳过：screen 不可渲染或 token 已过期',
            context: {
                route,
                renderToken,
                screenConnected: screen?.isConnected === true,
            },
        });
        removeRoutePage(page);
        if (!deferInactivePhoneRouteRender()) {
            __test__discardReviewNavigationAttemptForRoute(route, opts);
        }
        return false;
    }

    if (pendingQQRoute?.page === page) pendingQQRoute.release();
    page.classList.add('phone-page-active');
    screen.appendChild(page);
    removeStaleRoutePages(screen, [page]);
    bindPhoneScrollGuards(page);
    hardenPhoneInteractionDefaults(page);
    getPhoneCoreState().shellAppControls?.refresh?.();
    logRouteScrollDebugSnapshot(route, page);

    return true;
}

function scheduleRouteCommit({ screen, page, route, renderToken, opts }) {
    const unregisterPendingPage = phoneRuntime.registerCleanup(() => removeRoutePage(page));
    let frameId;
    const unregisterFrameCleanup = registerRoutePageCleanup(page, () => {
        phoneRuntime.cancelAnimationFrame(frameId);
        unregisterPendingPage();
    });

    frameId = phoneRuntime.requestAnimationFrame(() => {
        unregisterFrameCleanup();
        unregisterPendingPage();
        if (cancelledQQPages.has(page) || !isRenderableScreen(screen, renderToken)) {
            logger.debug({
                action: 'commit.schedule.skip',
                message: 'route 页面延迟提交跳过：screen 不可渲染或 token 已过期',
                context: {
                    route,
                    renderToken,
                    screenConnected: screen?.isConnected === true,
                },
            });
            removeRoutePage(page);
            if (!deferInactivePhoneRouteRender()) {
                __test__discardReviewNavigationAttemptForRoute(route, opts);
            }
            return;
        }
        commitRoutePage({ screen, page, route, renderToken, opts });
    });

    return true;
}

export async function renderPhoneRoute(route, opts = {}) {
    const context = createRouteRenderContext(route, opts);
    if (!context) {
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：无法创建渲染上下文',
            context: {
                route,
                renderToken: opts.renderToken,
            },
        });
        if (!deferInactivePhoneRouteRender(context?.state)) {
            __test__discardReviewNavigationAttemptForRoute(route, opts);
        }
        return false;
    }

    pendingQQRoute?.cancel();
    const routeRenderer = await resolveRouteRenderer(context.route, context.renderToken, opts);
    if (!routeRenderer) {
        removeRoutePage(context.page);
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：未找到 route renderer',
            context: {
                route: context.route,
                renderToken: context.renderToken,
            },
        });
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    if (!isRenderableScreen(context.screen, context.renderToken, context.state)) {
        removeRoutePage(context.page);
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：screen 不可渲染或 render token 已过期',
            context: {
                route: context.route,
                renderToken: context.renderToken,
                activeRenderToken: context.state?.routeRenderToken,
                screenConnected: context.screen?.isConnected === true,
                isDestroying: context.state?.isDestroying === true,
            },
        });
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    if (!await renderResolvedRoutePage(routeRenderer, context)) {
        removeRoutePage(context.page);
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    scheduleRouteCommit({ ...context, opts });
    return true;
}
