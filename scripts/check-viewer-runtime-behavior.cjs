const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

class FakeHTMLElement {
    constructor(name = 'element') {
        this.name = name;
        this.dataset = {};
        this.style = {};
        this.nodes = new Map();
        this.isConnected = true;
        this.parentElement = null;
    }

    querySelector(selector) {
        return this.nodes.get(selector) || null;
    }

    querySelectorAll() {
        return [];
    }

    setQuery(selector, value) {
        this.nodes.set(selector, value);
        return value;
    }

    contains(target) {
        return target === this;
    }

    addEventListener() {}

    removeEventListener() {}
}

function installDomGlobals(order = []) {
    global.HTMLElement = FakeHTMLElement;
    global.Element = FakeHTMLElement;
    global.requestAnimationFrame = (callback) => {
        if (typeof callback === 'function') callback(Date.now());
        return 1;
    };
    global.cancelAnimationFrame = () => {};

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.target = null;
            this.options = null;
        }

        observe(target, options = {}) {
            this.target = target;
            this.options = options;
            order.push(`observe:${target?.name || 'unknown'}`);
        }

        disconnect() {
            order.push('observer-disconnect');
        }
    }

    global.MutationObserver = FakeMutationObserver;
    const body = new FakeHTMLElement('body');
    const windowTarget = {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        setTimeout: global.setTimeout.bind(global),
        clearTimeout: global.clearTimeout.bind(global),
        requestAnimationFrame: global.requestAnimationFrame,
        cancelAnimationFrame: global.cancelAnimationFrame,
    };
    global.window = windowTarget;
    global.document = {
        body,
        getElementById() {
            return null;
        },
    };
    return { body, windowTarget };
}

async function importViewerModules() {
    const runtimeModule = await import(toModuleUrl('modules/table-viewer/runtime.js'));
    const genericRuntimeModule = await import(toModuleUrl('modules/table-viewer/generic-runtime.js'));
    const callbacksModule = await import(toModuleUrl('modules/phone-core/callbacks.js'));
    return { runtimeModule, genericRuntimeModule, callbacksModule };
}

async function testViewerRuntimeStartSession(runtimeModule) {
    const order = [];
    installDomGlobals(order);
    const container = new FakeHTMLElement('viewer-container');
    const observerRoot = new FakeHTMLElement('body');
    const runtime = runtimeModule.createViewerRuntime({
        container,
        sheetKey: 'sheet_runtime',
        rerenderViewer: () => {},
        runtimeDeps: {
            getModalById: () => null,
            acquireCurrentViewingSheet: (sheetKey) => {
                order.push(`acquire:${sheetKey}`);
                return { sheetKey };
            },
            releaseCurrentViewingSheet: (owner) => order.push(`release:${owner.sheetKey}`),
            resetDataVersion: () => order.push('reset'),
            bindTemplateDraftPreviewForViewer: (host, sheetKey) => {
                order.push(`draft:${sheetKey}`);
                host.__yuziDraftPreviewCleanup = () => order.push('draft-cleanup');
            },
            getObserverRoot: () => observerRoot,
        },
    });

    assert.ok(runtime);
    assert.equal(runtime.startViewerSession(), true);
    assert.deepEqual(order.slice(0, 4), [
        'acquire:sheet_runtime',
        'reset',
        'draft:sheet_runtime',
        'observe:body',
    ]);

    runtime.dispose();
    assert.ok(order.includes('draft-cleanup'));
    assert.ok(order.includes('observer-disconnect'));
    assert.ok(order.includes('release:sheet_runtime'));
}

async function testViewingSheetLeaseRace(callbacksModule) {
    callbacksModule.setCurrentViewingSheet(null);
    const ownerA = callbacksModule.acquireCurrentViewingSheet('sheet_a');
    const ownerB = callbacksModule.acquireCurrentViewingSheet('sheet_b');
    assert.equal(callbacksModule.getCurrentViewingSheet(), 'sheet_b');
    assert.equal(callbacksModule.releaseCurrentViewingSheet(ownerA), false);
    assert.equal(callbacksModule.getCurrentViewingSheet(), 'sheet_b');
    assert.equal(callbacksModule.releaseCurrentViewingSheet(ownerB), true);
    assert.equal(callbacksModule.getCurrentViewingSheet(), null);
    assert.equal(callbacksModule.releaseCurrentViewingSheet(ownerA), false);
}

async function testViewerRuntimeSuppressDepth(runtimeModule) {
    installDomGlobals();
    const runtime = runtimeModule.createViewerRuntime({
        container: new FakeHTMLElement('viewer-container'),
        sheetKey: 'sheet_runtime',
        rerenderViewer: () => {},
    });

    assert.equal(runtime.isSuppressingExternalTableUpdate(), false);
    runtime.setSuppressExternalTableUpdate(true);
    assert.equal(runtime.isSuppressingExternalTableUpdate(), true);
    runtime.setSuppressExternalTableUpdate(true);
    assert.equal(runtime.isSuppressingExternalTableUpdate(), true);
    runtime.setSuppressExternalTableUpdate(false);
    assert.equal(runtime.isSuppressingExternalTableUpdate(), true);
    runtime.setSuppressExternalTableUpdate(false);
    assert.equal(runtime.isSuppressingExternalTableUpdate(), false);
    runtime.setSuppressExternalTableUpdate(false);
    assert.equal(runtime.isSuppressingExternalTableUpdate(), false);
}

async function testGenericRuntimeStartOrder(genericRuntimeModule) {
    const order = [];
    const container = new FakeHTMLElement('generic-container');
    const viewerRuntime = {
        addRowModalId: 'modal-generic',
        bindExternalTableUpdate() {
            order.push('bind');
        },
        setSuppressExternalTableUpdate() {},
    };
    const runtime = genericRuntimeModule.createGenericTableViewerRuntime(
        container,
        {
            sheetKey: 'sheet_generic',
            tableName: 'Generic table',
            headers: [],
            rawHeaders: [],
            rows: [],
            genericMatch: null,
        },
        {
            viewerRuntime,
            renderListPage: () => order.push('render'),
        },
    );

    assert.ok(runtime);
    assert.equal(runtime.start(), true);
    assert.deepEqual(order, ['bind', 'render']);
}

async function testGenericRuntimeRefreshBoundaries(genericRuntimeModule) {
    installDomGlobals();
    let lockReads = 0;
    window.AutoCardUpdaterAPI = {
        exportTableAsJson: () => ({ sheet_refresh: { name: 'Refresh table', content: [['name'], ['fresh']] } }),
        getTableLockState: () => { lockReads += 1; return { rows: [], cols: [], cells: [] }; },
    };
    let listRenders = 0;
    let detailRenders = 0;
    let patches = 0;
    let setListRefreshHandler;
    const frames = new Map();
    let nextFrame = 0;
    const runtime = genericRuntimeModule.createGenericTableViewerRuntime(new FakeHTMLElement(), {
        sheetKey: 'sheet_refresh', tableName: 'Refresh table', headers: ['name'], rawHeaders: ['name'], rows: [['old']],
    }, {
        viewerRuntime: {
            requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
            cancelAnimationFrame(id) { frames.delete(id); },
        },
        renderListPage(options) {
            listRenders += 1;
            setListRefreshHandler = options.setListRefreshHandler;
            setListRefreshHandler(() => {
                patches += 1;
                options.state.syncLockState(options.getTableLockState(options.sheetKey));
            });
        },
        renderDetailPage() { detailRenders += 1; },
    });
    runtime.start();
    lockReads = 0;
    runtime.refreshListAfterDataMutation();
    assert.equal(patches, 1, '本地刷新中的锁同步不得再次派发列表刷新');
    assert.equal(lockReads, 1);
    lockReads = 0;
    runtime.handleTableUpdate();
    assert.equal(patches, 2, '外部更新只经状态订阅刷新一次列表');
    assert.equal(lockReads, 2);

    runtime.state.set('listSearchQuery', 'a');
    runtime.state.set('listSearchQuery', 'ab');
    assert.equal(frames.size, 1, '搜索仍合并到同一帧');
    const frame = frames.values().next().value;
    frames.clear();
    frame();
    assert.equal(patches, 3);

    runtime.state.enterDetailMode(0);
    runtime.handleTableUpdate();
    assert.equal(detailRenders, 1, '外部更新仍显式刷新详情');
    assert.equal(patches, 3, '详情不得消费遗留列表 handler');
    runtime.state.returnToListMode();
    const patchesBeforeFallback = patches;
    setListRefreshHandler(null);
    runtime.handleTableUpdate();
    assert.equal(listRenders, 2, '未注册局部 handler 时保留整页回退');
    assert.equal(patches, patchesBeforeFallback);
}

async function testDetailRenderLockSnapshot() {
    installDomGlobals();
    const { renderGenericDetailPage } = await import(toModuleUrl('modules/table-viewer/detail-page-renderer.js'));
    const locks = await import(toModuleUrl('modules/phone-core/data-api/lock-repository.js'));
    const headers = Array.from({ length: 80 }, (_, index) => `field_${index}`);
    const rows = [headers.map((_, index) => `value_${index}`)];
    for (const [lockState, expectedLockedFields] of [
        [{ rows: [], cols: [1], cells: ['0:2'] }, 2],
        [{ rows: [0], cols: [], cells: [] }, 80],
    ]) {
        let lockReads = 0;
        window.AutoCardUpdaterAPI = { getTableLockState: () => { lockReads += 1; return lockState; } };
        const container = new FakeHTMLElement();
        const state = { rowIndex: 0, draftValues: {}, syncLockState(value) { this.lockState = value; } };
        renderGenericDetailPage({
            container, state, sheetKey: 'sheet_locks', headers, rawHeaders: headers, rows,
            ddlFieldMetadata: { byRawIndex: { 0: { type: 'text' } } },
            getTableLockState: locks.getTableLockState,
            isTableRowLocked: locks.isTableRowLocked,
            isTableCellLocked: locks.isTableCellLocked,
        });
        assert.equal(lockReads, 1, '80 字段详情渲染仅读取一次锁快照');
        assert.equal((container.innerHTML.match(/phone-generic-slot-detail-field is-locked/g) || []).length, expectedLockedFields,
            '行锁、列锁和精确单元格锁保持原显示语义');
    }
}

async function main() {
    installDomGlobals();
    const { runtimeModule, genericRuntimeModule, callbacksModule } = await importViewerModules();

    await testViewerRuntimeStartSession(runtimeModule);
    await testViewingSheetLeaseRace(callbacksModule);
    await testViewerRuntimeSuppressDepth(runtimeModule);
    await testGenericRuntimeStartOrder(genericRuntimeModule);
    await testGenericRuntimeRefreshBoundaries(genericRuntimeModule);
    await testDetailRenderLockSnapshot();

    console.log('[viewer-runtime-behavior-check] passed');
    console.log('- viewer session startup and cleanup order');
    console.log('- viewing sheet lease ownership');
    console.log('- external update suppression depth');
    console.log('- generic runtime bind then render order');
    console.log('- generic refresh coalescing, detail and missing-handler fallback');
    console.log('- detail render uses one lock snapshot');
}

main().catch((error) => {
    console.error('[viewer-runtime-behavior-check] failed:');
    console.error(error);
    process.exitCode = 1;
});
