const { createDeferred: deferred } = require('./helpers/deferred.cjs');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const fresh = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);
async function checkActions() {
    const { createContentPresetActions } = await fresh('modules/content-presets/runtime-actions.js');
    let current = true;
    const calls = [];
    const actions = createContentPresetActions({
        sheetKey: 'sheet-a', getRoute: () => 'table:sheet-a', isCurrent: () => current,
        navigateBack: () => { calls.push(['back']); return 'home'; },
        navigateTo: route => calls.push(['edit', route]),
        requestTableNavigationSwitch: (_key, direction) => {
            calls.push(['switch', direction]);
            return { navigated: true, target: { route: `table:${direction}` } };
        },
    });
    assert.equal((await actions.back()).targetRoute, 'home');
    assert.equal((await actions.previousTable()).targetRoute, 'table:previous');
    assert.equal((await actions.nextTable()).targetRoute, 'table:next');
    assert.equal((await actions.editCurrentTable()).targetRoute, 'table-generic:sheet-a');

    let acceptedCurrent = true;
    const accepted = createContentPresetActions({
        sheetKey: 'sheet-a', getRoute: () => 'table:sheet-a', isCurrent: () => acceptedCurrent,
        requestTableNavigationSwitch: () => {
            acceptedCurrent = false;
            return { navigated: true, target: { route: 'table:sheet-b' } };
        },
    });
    assert.deepEqual(await accepted.nextTable(), {
        ok: true, action: 'nextTable', status: 'navigated', fromRoute: 'table:sheet-a', targetRoute: 'table:sheet-b',
    });

    current = false;
    for (const action of ['back', 'previousTable', 'nextTable', 'editCurrentTable']) {
        assert.equal((await actions[action]()).status, 'stale');
    }
    const unavailable = createContentPresetActions({
        sheetKey: 'sheet-a', getRoute: () => 'table:sheet-a', isCurrent: () => true,
        requestTableNavigationSwitch: () => ({ navigated: false, reason: 'missing' }),
    });
    assert.equal((await unavailable.previousTable()).status, 'unavailable');
    assert.equal((await unavailable.nextTable()).status, 'unavailable');
    let backCalls = 0;
    const reentry = createContentPresetActions({
        sheetKey: 'sheet-a', getRoute: () => 'table:sheet-a', isCurrent: () => true,
        navigateBack: () => { backCalls += 1; return 'home'; },
    });
    const first = reentry.back();
    const second = reentry.back();
    assert.strictEqual(first, second, '同 action 重入必须合流到同一 Promise');
    await first;
    assert.equal(backCalls, 1);
    const bottom = createContentPresetActions({ disabled: true, isCurrent: () => true });
    for (const action of ['back', 'previousTable', 'nextTable', 'editCurrentTable']) {
        assert.equal((await bottom[action]()).status, 'unavailable', '底部保留动作接口但不执行手机导航');
    }
}

async function checkScriptRuntime() {
    const { importContentPresetModule, invokeContentPresetMount } = await fresh('modules/content-presets/script-runtime.js');
    const created = []; const revoked = [];
    for (let index = 0; index < 50; index += 1) {
        const runtime = await importContentPresetModule({
            source: 'export function mount() {}', BlobCtor: class {},
            createObjectURL: () => { const url = `blob:${index}`; created.push(url); return url; },
            revokeObjectURL: url => revoked.push(url), importModule: async () => ({ mount() {} }),
        });
        runtime.disposeModuleUrl(); runtime.disposeModuleUrl();
    }
    assert.equal(created.length, 50); assert.equal(revoked.length, 50);
    await assert.rejects(() => importContentPresetModule({
        source: '', BlobCtor: class {}, createObjectURL: () => 'blob:missing',
        revokeObjectURL: url => revoked.push(url), importModule: async () => ({}),
    }), /缺少 mount/);
    const late = deferred(); let lateDisposerCalls = 0;
    await assert.rejects(() => invokeContentPresetMount({
        mount: () => late.promise, timeoutMs: 1,
        onLateDisposer: disposer => disposer(),
    }), /超时/);
    late.resolve(() => { lateDisposerCalls += 1; });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(lateDisposerCalls, 1, '超时后迟到 disposer 必须执行一次');
    const controller = new AbortController(); const aborted = deferred(); let abortLateCalls = 0;
    const pending = invokeContentPresetMount({ mount: () => aborted.promise, signal: controller.signal, onLateDisposer: disposer => disposer() });
    controller.abort(); await assert.rejects(() => pending, error => error?.name === 'AbortError');
    aborted.resolve(() => { abortLateCalls += 1; }); await Promise.resolve(); await Promise.resolve();
    assert.equal(abortLateCalls, 1, 'abort 后迟到 disposer 必须执行一次');
}


async function checkInstances() {
    const { createContentPresetInstance } = await fresh('modules/content-presets/instance-coordinator.js');
    const calls = [];
    const instance = createContentPresetInstance({
        sheetKey: 'sheet-a', routeToken: 7, getGeneration: () => 1,
        isGenerationCurrent: () => true,
        onStopUpdates: () => calls.push('stop'),
        onCaptureScroll: () => calls.push('capture'),
        onHostCleanup: () => calls.push('cleanup'),
    });
    let disposerCalls = 0;
    instance.setAuthorDisposer(() => { disposerCalls += 1; });
    assert.equal(instance.isCurrent(7), true);
    instance.dispose(); instance.dispose();
    assert.equal(disposerCalls, 1);
    assert.deepEqual(calls, ['stop', 'capture', 'cleanup']);
    assert.equal(instance.state, 'disposed');
    assert.equal(instance.signal.aborted, true);

    const late = createContentPresetInstance({
        sheetKey: 'sheet-late', routeToken: 8, getGeneration: () => 1,
        isGenerationCurrent: () => true,
    });
    let lateCalls = 0;
    late.dispose();
    late.setAuthorDisposer(() => { lateCalls += 1; });
    late.setAuthorDisposer(() => { lateCalls += 1; });
    assert.equal(lateCalls, 1, 'disposed 实例接收迟到 disposer 时最多执行一次');
    assert.equal(late.transition('active'), false, 'disposed 实例不得复活');
}

async function checkScrollRegistry() {
    const { createContentPresetScrollRegistry } = await fresh('modules/content-presets/scroll-registry.js');
    const frames = new Map(); const cancelled = []; let nextId = 0;
    const registry = createContentPresetScrollRegistry({
        maxEntries: 2,
        requestFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
        cancelFrame(id) { cancelled.push(id); frames.delete(id); },
    });
    const key = (chatId, itemId = 'item-a') => ({ chatId, sheetKey: 'sheet-a', presetId: 'preset-a', itemId });
    assert.equal(registry.write(key(''), 10), false);
    assert.equal(registry.write(key('chat-a'), 120), true);
    assert.equal(registry.write(key('chat-b'), 340), true);
    assert.equal(registry.read(key('chat-a')).scrollTop, 120);
    assert.equal(registry.read(key('chat-b')).scrollTop, 340);
    assert.equal(registry.read(key('chat-c')), null, '滚动缓存不得跨 chat 命中');

    const root = { scrollTop: 0, scrollHeight: 300, clientHeight: 100 };
    registry.write(key('chat-a'), 500);
    registry.restore(root, key('chat-a'), () => true, 0);
    const apply = frames.values().next().value; frames.clear(); apply();
    assert.equal(root.scrollTop, 200, '恢复值必须按页面最大滚动位置 clamp');

    const cancelledRoot = { scrollTop: 7, scrollHeight: 300, clientHeight: 100 };
    registry.write(key('chat-a'), 80);
    const cancel = registry.restore(cancelledRoot, key('chat-a'), () => true, 0);
    const cancelledApply = frames.values().next().value;
    cancel(); cancelledApply();
    assert.equal(cancelledRoot.scrollTop, 7, '取消恢复后不得写入 root');
    assert.equal(cancelled.length > 0, true);

    registry.write(key('chat-a', 'a'), 1);
    registry.write(key('chat-a', 'b'), 2);
    registry.read(key('chat-a', 'a'));
    registry.write(key('chat-a', 'c'), 3);
    assert.equal(registry.read(key('chat-a', 'b')), null, 'LRU 必须淘汰最久未访问项');
    assert.equal(registry.read(key('chat-a', 'a')).scrollTop, 1);
    registry.write({ ...key('chat-a', 'a'), surface: 'bottom' }, 42);
    registry.clearByBinding(key('chat-a', 'a'));
    assert.equal(registry.read({ ...key('chat-a', 'a'), surface: 'bottom' })?.scrollTop, 42, '清理手机滚动位置不得清理底部记录');
    registry.dispose();
    assert.equal(registry.size(), 0);
}

async function main() {
    await checkActions();
    await checkScriptRuntime();
    await checkInstances();
    await checkScrollRegistry();
    console.log('[content-presets-p2-behavior-check] 检查通过');
}

main().catch(error => { console.error('[content-presets-p2-behavior-check] 检查失败：', error); process.exitCode = 1; });
