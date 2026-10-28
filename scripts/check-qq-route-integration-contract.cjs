const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(file)).href);

function bootstrap(scopeId = 'scope-a') {
    return { ok: true, context: { scopeId } };
}

function createAppFactory(records) {
    return (options) => {
        const app = {
            options,
            mounted: null,
            destroyed: 0,
            mount(page) { this.mounted = page; return this; },
            async refresh() {},
            destroy() { this.destroyed += 1; },
        };
        records.push(app);
        return app;
    };
}

function nextTurn() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
    const { __test__loadRouteRenderer } = await load('modules/phone-core/route-renderer.js');
    const { disposeRoutePage } = await load('modules/phone-core/route-page-lifecycle.js');

    const records = [];
    const shell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const facade = {
        query: { async bootstrap() { return bootstrap(); } },
        subscribe() { return () => {}; },
    };
    const routeDeps = {
        loadQQRouteDependencies: async () => ({
            createQQApp: createAppFactory(records),
            createQQRouteLifecycle: (options) => ({
                async mount() {
                    const app = options.createApp({ facade: options.facade, shell: options.shell });
                    app.mount(options.page);
                    return true;
                },
                destroy() { records.at(-1)?.destroy(); },
            }),
            getQQV2Facade: () => facade,
        }),
        getQQRouteShell: () => shell,
    };

    const rootRoute = await __test__loadRouteRenderer('qq', 401, routeDeps);
    assert.equal(rootRoute.routeType, 'qq');
    const rootPage = {};
    assert.equal(await rootRoute.render(rootPage), true);
    await nextTurn();
    assert.equal(records.length, 1);
    assert.equal(records[0].mounted, rootPage);
    assert.equal(records[0].options.facade, facade);
    assert.equal(records[0].options.shell, shell);
    disposeRoutePage(rootPage);
    assert.equal(records[0].destroyed, 1, 'route page cleanup destroys the QQ root');

    const nestedRoute = await __test__loadRouteRenderer('qq:old-chat-state-must-not-restore', 402, routeDeps);
    const nestedPage = {};
    await nestedRoute.render(nestedPage);
    await nextTurn();
    assert.equal(records.length, 2, 'every qq:* launch receives a new QQ root instance');
    assert.equal(records[1].mounted, nestedPage);

    let blanked = 0;
    const missingFacadeRoute = await __test__loadRouteRenderer('qq', 403, {
        ...routeDeps,
        loadQQRouteDependencies: async () => ({
            createQQApp: createAppFactory([]),
            createQQRouteLifecycle: () => { throw new Error('must not create without a Facade'); },
            getQQV2Facade: () => null,
        }),
    });
    assert.equal(await missingFacadeRoute.render({ replaceChildren() { blanked += 1; } }), false);
    await nextTurn();
    assert.equal(blanked, 0, 'missing Facade rejects the candidate instead of submitting an empty QQ page');
    assert.equal(shell.toasts.length, 1, 'missing Facade reports one shell toast');

    const failedShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const loadFailure = await __test__loadRouteRenderer('qq', 404, {
        loadQQRouteDependencies: async () => { throw new Error('simulated dynamic import failure'); },
        getQQRouteShell: () => failedShell,
    });
    let failedBlanked = 0;
    assert.equal(await loadFailure.render({ replaceChildren() { failedBlanked += 1; } }), false);
    await nextTurn();
    assert.equal(loadFailure.routeType, 'qq');
    assert.equal(failedBlanked, 0, 'dynamic loader failures leave the displayed page untouched');
    assert.equal(failedShell.toasts.length, 1, 'dynamic loader failures produce one safe toast');

    let resolveDelayedDependencies;
    let delayedLifecycleCreated = 0;
    const delayedRoute = await __test__loadRouteRenderer('qq', 405, {
        ...routeDeps,
        loadQQRouteDependencies: () => new Promise((resolve) => {
            resolveDelayedDependencies = resolve;
        }),
    });
    const delayedPage = {};
    const delayedRender = delayedRoute.render(delayedPage);
    assert.equal(typeof delayedRender?.then, 'function', 'QQ 路由等到真实首屏就绪才允许外壳提交');
    disposeRoutePage(delayedPage);
    assert.equal(await delayedRender, false, '取消必须立即结束等待，无需等动态依赖返回');
    resolveDelayedDependencies({
        createQQApp: createAppFactory([]),
        createQQRouteLifecycle: () => {
            delayedLifecycleCreated += 1;
            return { async mount() {}, destroy() {} };
        },
        getQQV2Facade: () => facade,
    });
    await nextTurn();
    assert.equal(delayedLifecycleCreated, 0, '路由页提前销毁后不得再挂载迟到的 QQ App');

    let resolveReady;
    let readyDestroyed = 0;
    const readyGate = new Promise(resolve => { resolveReady = resolve; });
    const waitingRoute = await __test__loadRouteRenderer('qq', 406, {
        ...routeDeps,
        loadQQRouteDependencies: async () => ({
            createQQApp: createAppFactory([]),
            createQQRouteLifecycle: () => ({
                mount: () => readyGate,
                destroy() { readyDestroyed += 1; },
            }),
            getQQV2Facade: () => facade,
        }),
    });
    const waitingPage = {};
    let submitted = false;
    const waitingRender = waitingRoute.render(waitingPage).then(result => { submitted = result; return result; });
    await nextTurn();
    assert.equal(submitted, false, '创建 App 后，首屏未完成仍不能提交 QQ 页面');
    resolveReady(true);
    assert.equal(await waitingRender, true);
    disposeRoutePage(waitingPage);
    assert.equal(readyDestroyed, 1);

    const { notifyPhoneActivity, resetPhoneRuntimeScope } = await load('modules/phone-core/state.js');
    for (const cancel of [notifyPhoneActivity, resetPhoneRuntimeScope]) {
        let finishLoad;
        const closingRoute = await __test__loadRouteRenderer('qq', 407, {
            ...routeDeps,
            loadQQRouteDependencies: () => new Promise(resolve => { finishLoad = resolve; }),
        });
        const closingRender = closingRoute.render({});
        cancel();
        assert.equal(await closingRender, false, '隐藏或销毁 runtime 必须立即取消未提交的 QQ 页面');
        finishLoad({ ...routeDeps, createQQRouteLifecycle: () => { throw new Error('cancelled page must not mount'); } });
        await nextTurn();
    }

    const fs = require('node:fs');
    const routeSource = fs.readFileSync(path.resolve('modules/phone-core/route-renderer.js'), 'utf8');
    assert.doesNotMatch(routeSource, /qqRouteSkeleton|renderQQRouteSkeleton/u,
        'QQ 首次进入不再创建可见骨架');
    assert.match(routeSource, /await lifecycle\.mount\(\)/u,
        'QQ 首屏就绪信号必须传回路由提交层');

    const appSource = fs.readFileSync(path.resolve('modules/qq-v2/ui/app.js'), 'utf8');
    assert.doesNotMatch(appSource, /phone-status-bar|phone-home-indicator/, 'QQ must consume shell status and Home Indicator instead of duplicating them');
    assert.doesNotMatch(appSource, /navigateTo\(|replaceCurrentRoute\(|routeHistory|currentRoute\s*=/,
        'QQ root tab switches must stay inside the app and never mutate phone route history');
    console.log('[qq-route-integration-contract] passed');
}

main().catch((error) => {
    console.error('[qq-route-integration-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
