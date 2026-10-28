const { createDeferred: deferred } = require('./helpers/deferred.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(file)).href);

function bootstrap(scopeId = 'scope-a') {
    return { ok: true, context: { scopeId } };
}

function createPage() {
    return {
        clearCount: 0,
        isConnected: true,
        replaceChildren() { this.clearCount += 1; },
    };
}

function createAppRecorder() {
    const created = [];
    const createApp = (options) => {
        const app = {
            options,
            mounts: [],
            refreshes: 0,
            destroys: 0,
            mount(page) { this.mounts.push(page); return this; },
            async refresh() { this.refreshes += 1; },
            destroy() { this.destroys += 1; },
        };
        created.push(app);
        return app;
    };
    return { created, createApp };
}

async function checkFirstRenderReadiness(createQQRouteLifecycle) {
    const { FakeElement, installFakeDom, flushUi, privateConversation, createFakeFacade } = require('./helpers/qq-ui-fixture.cjs');
    global.HTMLElement = FakeElement;
    global.Element = FakeElement;
    installFakeDom().getElementById = () => null;
    const { createQQApp } = await load('modules/qq-v2/ui/app.js');
    const createApp = options => createQQApp({ ...options, getSettings: () => ({}) });

    const firstRead = deferred();
    const firstStarted = deferred();
    const { facade } = createFakeFacade({ initialConversations: [privateConversation('最新', 'latest')] });
    const readConversations = facade.query.conversations;
    let listener, firstQuery = true;
    facade.query.conversations = () => {
        if (!firstQuery) return readConversations();
        firstQuery = false;
        firstStarted.resolve();
        return firstRead.promise;
    };
    facade.subscribe = fn => { listener = fn; return () => {}; };
    const page = new FakeElement();
    const prepared = createQQRouteLifecycle({ page, facade, createApp });
    let settled = false;
    const mounting = prepared.mount().then(result => { settled = true; return result; });
    await firstStarted.promise;
    await flushUi();
    assert.equal(settled, false, 'mount waits for real first content, not App.mount returning');
    assert.equal(page.isConnected, false, 'QQ can prepare before the route is connected');
    await listener({ scopeId: 'scope-add-contact-ui' });
    assert.equal(await mounting, true, 'a preparation-time update can complete the latest first render');
    assert.ok(page.querySelector('[data-qq-conversation-id="latest"]'));
    assert.ok(page.querySelector('.yuzi-qq-root-tabbar'), 'the first ready frame includes navigation');
    firstRead.resolve({ ok: true, conversations: [privateConversation('旧数据', 'stale')] });
    await flushUi();
    assert.equal(page.querySelector('[data-qq-conversation-id="stale"]'), null, 'late first reads cannot replace a newer prepared frame');
    prepared.destroy();

    const hiddenRead = deferred();
    const hiddenStarted = deferred();
    const hiddenFixture = createFakeFacade();
    let visible = true, activity, hiddenFirst = true;
    hiddenFixture.facade.query.conversations = () => {
        if (!hiddenFirst) return Promise.resolve({ ok: true, conversations: [] });
        hiddenFirst = false;
        hiddenStarted.resolve();
        return hiddenRead.promise;
    };
    const hiddenToasts = [];
    const hidden = createQQRouteLifecycle({ page: new FakeElement(), facade: hiddenFixture.facade, createApp,
        isVisible: () => visible, subscribeActivity(fn) { activity = fn; return () => {}; },
        shell: { showToast: message => hiddenToasts.push(message) },
    });
    let hiddenSettled = false;
    const hiddenMount = hidden.mount().then(result => { hiddenSettled = true; return result; });
    await hiddenStarted.promise;
    visible = false;
    activity();
    hiddenRead.reject(new Error('obsolete hidden read'));
    await flushUi();
    assert.equal(hiddenSettled, false, 'a suspended first render keeps readiness pending');
    assert.deepEqual(hiddenToasts, [], 'a hidden obsolete failure does not report a first-render failure');
    visible = true;
    activity();
    assert.equal(await hiddenMount, true, 'the resumed successful frame settles readiness');
    hidden.destroy();

    const failedFixture = createFakeFacade();
    failedFixture.facade.query.conversations = async () => { throw new Error('first render failed'); };
    const toasts = [];
    const failed = createQQRouteLifecycle({ page: new FakeElement(), facade: failedFixture.facade, createApp,
        shell: { showToast: message => toasts.push(message) },
    });
    assert.equal(await failed.mount(), false, 'a real first-render failure rejects the candidate route');
    await flushUi();
    assert.equal(toasts.length, 1, 'a first-render failure reports only one toast');
    failed.destroy();

    const contextRead = deferred();
    let created = 0;
    const cancelled = createQQRouteLifecycle({ page: createPage(),
        facade: { query: { currentContext: () => contextRead.promise } },
        createApp() { created += 1; throw new Error('cancelled route must not mount'); },
    });
    const cancelledMount = cancelled.mount();
    cancelled.destroy();
    assert.equal(await cancelledMount, false, 'destroy settles mount while the initial context read is still pending');
    contextRead.resolve(bootstrap());
    await flushUi();
    assert.equal(created, 0);

    const cancelledRead = deferred();
    const cancelledStarted = deferred();
    const cancelledFixture = createFakeFacade();
    cancelledFixture.facade.query.conversations = () => { cancelledStarted.resolve(); return cancelledRead.promise; };
    let cancelledApp;
    const cancelledPage = new FakeElement();
    const pending = createQQRouteLifecycle({ page: cancelledPage, facade: cancelledFixture.facade,
        createApp(options) { cancelledApp = createApp(options); return cancelledApp; },
    });
    const pendingMount = pending.mount();
    await cancelledStarted.promise;
    pending.destroy();
    assert.equal(await pendingMount, false, 'destroy settles mount while the real App is still preparing');
    assert.equal(await cancelledApp.whenReady(), false, 'destroy also settles App readiness');
    cancelledRead.resolve({ ok: true, conversations: [] });
    await flushUi();
    assert.equal(cancelledPage.children.length, 0, 'a cancelled first render cannot repopulate its page');

    const previousIndexedDB = global.indexedDB;
    global.indexedDB = { open() { throw new Error('skin repository unavailable'); } };
    const fallbackFixture = createFakeFacade();
    const fallback = createQQRouteLifecycle({ page: new FakeElement(), facade: fallbackFixture.facade, createApp });
    try {
        assert.equal(await fallback.mount(), true, 'an unavailable skin falls back to the default and still becomes ready');
    } finally {
        fallback.destroy();
        if (previousIndexedDB === undefined) delete global.indexedDB;
        else global.indexedDB = previousIndexedDB;
    }
}

async function main() {
    const { createQQRouteLifecycle } = await load('modules/qq-v2/ui/route-lifecycle.js');

    const firstPage = createPage();
    const firstApps = createAppRecorder();
    let firstListener = null;
    const firstFacade = {
        query: { async bootstrap() { return bootstrap(); } },
        subscribe(listener) { firstListener = listener; return () => { firstListener = null; }; },
    };
    const shell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const first = createQQRouteLifecycle({
        page: firstPage,
        facade: firstFacade,
        createApp: firstApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await first.mount(), true);
    await Promise.resolve();
    assert.equal(firstApps.created.length, 1, 'each QQ home launch creates a root app instance');
    assert.deepEqual(firstApps.created[0].mounts, [firstPage]);
    assert.equal(firstApps.created[0].options.facade, firstFacade);
    assert.equal(firstApps.created[0].options.shell, shell);
    await firstListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(firstApps.created[0].refreshes, 1, 'same-scope Facade updates refresh the mounted QQ root');
    await firstListener({
        status: 'changed',
        scopeId: 'scope-a',
        reason: 'conversation-opened',
        conversationId: 'private-1',
    });
    assert.equal(firstApps.created[0].refreshes, 1,
        'opening a conversation updates external unread projections without rerendering the navigating QQ root');
    await firstListener({ status: 'changed', scopeId: 'scope-b' });
    assert.equal(firstApps.created[0].refreshes, 1, 'a mismatched scope event cannot update this QQ root');
    firstPage.isConnected = false;
    await firstListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(firstApps.created[0].refreshes, 1, 'a detached QQ route page ignores later Facade updates');
    firstPage.isConnected = true;

    const secondPage = createPage();
    const secondApps = createAppRecorder();
    const second = createQQRouteLifecycle({
        page: secondPage,
        facade: { query: { async bootstrap() { return bootstrap(); } } },
        createApp: secondApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await second.mount(), true);
    assert.notEqual(secondApps.created[0], firstApps.created[0], 'relaunches never restore the former QQ root state');

    const emptyScopePage = createPage();
    const emptyScopeApps = createAppRecorder();
    const emptyScopeShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const emptyScope = createQQRouteLifecycle({
        page: emptyScopePage,
        facade: {
            query: {
                async bootstrap() {
                    return { ok: true, status: 'unavailable', context: { scopeId: '' } };
                },
            },
        },
        createApp: emptyScopeApps.createApp,
        shell: emptyScopeShell,
        isCurrent: () => true,
    });
    assert.equal(await emptyScope.mount(), true, 'no active Tavern chat still mounts the normal QQ root');
    assert.equal(emptyScopeApps.created.length, 1);
    assert.deepEqual(emptyScopeApps.created[0].mounts, [emptyScopePage]);
    assert.equal(emptyScopePage.clearCount, 0, 'an empty chat scope must not blank the QQ route page');
    assert.deepEqual(emptyScopeShell.toasts, [], 'an empty chat scope is not a QQ load failure');

    const scopeRead = deferred();
    let scopeListener = null;
    const scopedApps = createAppRecorder();
    const scoped = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: {
                async bootstrap() {
                    return scopeRead.promise;
                },
            },
            subscribe(listener) { scopeListener = listener; return () => { scopeListener = null; }; },
        },
        createApp: scopedApps.createApp,
        shell,
        isCurrent: () => true,
    });
    const scopedMount = scoped.mount();
    scopeRead.resolve(bootstrap());
    assert.equal(await scopedMount, true);
    await Promise.resolve();
    const refreshRead = deferred();
    // Replace the facade read only after initial mount: the stale update below now observes a new scope.
    scopedApps.created[0].options.facade.query.bootstrap = async () => refreshRead.promise;
    const staleRefresh = scopeListener({ status: 'changed', scopeId: 'scope-a' });
    refreshRead.resolve(bootstrap('scope-b'));
    await staleRefresh;
    assert.equal(scopedApps.created[0].refreshes, 0, 'scope changes during an async read cannot write stale results');

    const coalescedRead = deferred();
    let coalescedListener = null;
    let coalescedBootstrapCalls = 0;
    const coalescedApps = createAppRecorder();
    const coalesced = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: {
                async bootstrap() {
                    coalescedBootstrapCalls += 1;
                    if (coalescedBootstrapCalls === 2) return coalescedRead.promise;
                    return bootstrap();
                },
            },
            subscribe(listener) { coalescedListener = listener; return () => { coalescedListener = null; }; },
        },
        createApp: coalescedApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await coalesced.mount(), true);
    await Promise.resolve();
    const firstRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    const secondRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    const thirdRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    coalescedRead.resolve(bootstrap());
    await Promise.all([firstRefresh, secondRefresh, thirdRefresh]);
    assert.equal(coalescedApps.created[0].refreshes, 2,
        'notification bursts collapse to one active refresh plus one latest pending refresh');
    assert.equal(coalescedBootstrapCalls, 3,
        'coalesced refreshes avoid redundant snapshot reads from the same burst');

    let routeToken = 20;
    const staleRead = deferred();
    const staleApps = createAppRecorder();
    const stale = createQQRouteLifecycle({
        page: createPage(),
        facade: { query: { async bootstrap() { return staleRead.promise; } } },
        createApp: staleApps.createApp,
        shell,
        isCurrent: () => routeToken === 20,
    });
    const staleMount = stale.mount();
    routeToken = 21;
    staleRead.resolve(bootstrap());
    assert.equal(await staleMount, false);
    assert.equal(staleApps.created.length, 0, 'a superseded render token cannot mount after an async load');

    const subscriptionRead = deferred();
    let pendingListener = null;
    let pendingUnsubscribed = 0;
    const pendingApps = createAppRecorder();
    const pending = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: { async bootstrap() { return bootstrap(); } },
            subscribe(listener) {
                pendingListener = listener;
                return subscriptionRead.promise;
            },
        },
        createApp: pendingApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await pending.mount(), true);
    pending.destroy();
    subscriptionRead.resolve(() => { pendingUnsubscribed += 1; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(pendingUnsubscribed, 1, 'a subscription resolving after destroy is immediately released');
    await pendingListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(pendingApps.created[0].refreshes, 0, 'destroyed QQ roots ignore late subscriptions');

    const failedPage = createPage();
    const failedApps = createAppRecorder();
    const failedShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const failed = createQQRouteLifecycle({
        page: failedPage,
        facade: { query: { async bootstrap() { return { ok: false }; } } },
        createApp: failedApps.createApp,
        shell: failedShell,
        isCurrent: () => true,
    });
    assert.equal(await failed.mount(), false);
    await failed.mount();
    assert.equal(failedApps.created.length, 0);
    assert.equal(failedPage.clearCount > 0, true, 'a failed Facade read leaves the QQ shell blank');
    assert.equal(failedShell.toasts.length, 1, 'a failed QQ load produces exactly one user-facing toast');

    first.destroy();
    second.destroy();
    emptyScope.destroy();
    scoped.destroy();
    coalesced.destroy();
    stale.destroy();
    failed.destroy();
    await checkFirstRenderReadiness(createQQRouteLifecycle);
    console.log('[qq-route-lifecycle-contract] passed');
}

main().catch((error) => {
    console.error('[qq-route-lifecycle-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
