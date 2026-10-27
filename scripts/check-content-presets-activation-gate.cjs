const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const url = file => `${pathToFileURL(path.join(process.cwd(), file)).href}?t=${Date.now()}-${Math.random()}`;
const failIfCalled = label => () => { throw new Error(`${label} 不应被调用`); };

async function checkStartup(gate) {
    const { __test__createContentPresetIndexInitializer } = await import(url('modules/content-presets/startup.js'));
    const disabled = __test__createContentPresetIndexInitializer({
        isContentPresetFullPageRuntimeEnabled: () => false,
        getPhoneCoreState: failIfCalled('关闭态 phone state'),
        loadContentPresetIndex: failIfCalled('关闭态 index repository'),
        commitContentPresetIndex: failIfCalled('关闭态 index commit'),
        markContentPresetIndexUnavailable: failIfCalled('关闭态 unavailable commit'),
        convergeCurrentContentPresetRoute: failIfCalled('关闭态 route convergence'),
    });
    assert.equal(await disabled(), null, '注入关闭态时 startup 必须在所有状态与 I/O 之前结束');

    const calls = { index: 0, commit: 0, converge: 0 };
    const state = { currentRoute: 'table:sheet-a', routeRenderToken: 7 };
    const metadata = [{ id: 'preset-a', name: 'Preset A' }];
    const activeByTable = new Map([['sheet-a', { presetId: 'preset-a', itemId: 'item-a' }]]);
    const popupByTable = new Map([['sheet-popup', { presetId: 'preset-a', displays: [{ id: 'display-a' }] }]]);
    const bottomByTable = new Map([['sheet-bottom', { kind: 'builtin', sceneId: 'square' }]]);
    const index = { metadata, pageByTable: activeByTable, popupByTable, bottomByTable };
    let committedPatch = null;
    const enabled = __test__createContentPresetIndexInitializer({
        isContentPresetFullPageRuntimeEnabled: gate.isContentPresetFullPageRuntimeEnabled,
        getPhoneCoreState: () => state,
        loadContentPresetIndex: async () => { calls.index += 1; return index; },
        commitContentPresetIndex: patch => {
            calls.commit += 1;
            committedPatch = patch;
            return Object.freeze({ ...patch, revision: 1 });
        },
        markContentPresetIndexUnavailable: failIfCalled('开启态 unavailable commit'),
        convergeCurrentContentPresetRoute: async sheetKeys => {
            calls.converge += 1;
            assert.deepEqual(sheetKeys, ['sheet-a']);
        },
    });
    const first = enabled();
    const second = enabled();
    assert.strictEqual(first, second, 'startup 同一实例的并发初始化必须合流到同一 Promise');
    const snapshot = await first;
    assert.equal(snapshot.status, 'ready');
    assert.deepEqual(calls, { index: 1, commit: 1, converge: 1 });
    assert.equal(committedPatch.metadata.get('preset-a'), metadata[0]);
    assert.strictEqual(committedPatch.pageByTable, activeByTable);
    assert.strictEqual(committedPatch.popupByTable, popupByTable);
    assert.strictEqual(committedPatch.bottomByTable, bottomByTable);
    assert.strictEqual(committedPatch.activeByTable, activeByTable);

    let releaseIndex;
    const driftingState = { currentRoute: 'table:sheet-a', routeRenderToken: 7 };
    const drifted = __test__createContentPresetIndexInitializer({
        isContentPresetFullPageRuntimeEnabled: () => true,
        getPhoneCoreState: () => driftingState,
        loadContentPresetIndex: () => new Promise(resolve => { releaseIndex = resolve; }),
        commitContentPresetIndex: patch => Object.freeze({ ...patch, revision: 2 }),
        markContentPresetIndexUnavailable: failIfCalled('route 漂移时 unavailable commit'),
        convergeCurrentContentPresetRoute: failIfCalled('route 漂移后的 convergence'),
    });
    const driftedPromise = drifted();
    driftingState.routeRenderToken = 8;
    releaseIndex(index);
    assert.equal((await driftedPromise).status, 'ready', 'route 漂移不应阻止索引提交');

    const convergenceError = new Error('route convergence failed');
    let convergenceUnavailableCalls = 0;
    const readySnapshot = Object.freeze({ status: 'ready', revision: 3 });
    const convergenceFailed = __test__createContentPresetIndexInitializer({
        isContentPresetFullPageRuntimeEnabled: () => true,
        getPhoneCoreState: () => ({ currentRoute: 'table:sheet-a', routeRenderToken: 7 }),
        loadContentPresetIndex: async () => index,
        commitContentPresetIndex: () => readySnapshot,
        markContentPresetIndexUnavailable: () => { convergenceUnavailableCalls += 1; },
        convergeCurrentContentPresetRoute: async () => { throw convergenceError; },
    });
    const convergenceFirst = convergenceFailed();
    const convergenceSecond = convergenceFailed();
    assert.strictEqual(
        convergenceFirst,
        convergenceSecond,
        'convergence 失败路径的并发初始化仍必须合流到同一 Promise',
    );
    assert.strictEqual(await convergenceFirst, readySnapshot, 'convergence 失败不得覆盖已提交的 ready snapshot');
    assert.equal(convergenceUnavailableCalls, 0, 'convergence 失败不得标记内容预设索引 unavailable');

    const repositoryError = new Error('repository unavailable');
    let unavailableError = null;
    const failed = __test__createContentPresetIndexInitializer({
        isContentPresetFullPageRuntimeEnabled: () => true,
        getPhoneCoreState: () => ({ currentRoute: 'home', routeRenderToken: 1 }),
        loadContentPresetIndex: async () => { throw repositoryError; },
        commitContentPresetIndex: failIfCalled('repository 失败后的 index commit'),
        markContentPresetIndexUnavailable: error => { unavailableError = error; },
        convergeCurrentContentPresetRoute: failIfCalled('repository 失败后的 convergence'),
    });
    assert.equal(await failed(), null, 'repository 失败时 startup 必须收敛为 null');
    assert.strictEqual(unavailableError, repositoryError, 'repository 原始错误必须交给 unavailable 状态');
}

async function checkDisabledRuntimeBoundaries() {
    const workshop = await import(url('modules/content-presets/workshop-service.js'));
    const service = workshop.__test__createContentPresetWorkshopService({
        isContentPresetFullPageRuntimeEnabled: () => false,
        listPresetRecords: failIfCalled('关闭态 preset repository'),
        getContentPresetIndexSnapshot: failIfCalled('关闭态 workshop index'),
    }, {
        getTableData: failIfCalled('关闭态 table data'),
    });
    const viewModel = await service.getViewModel();
    assert.equal(viewModel.status, 'unavailable', '注入关闭态时模板工坊必须保持不可用');
    assert.deepEqual(viewModel.presets, []);
    assert.deepEqual(viewModel.tables, []);
    await assert.rejects(() => service.prepareImport('{}'), /完整页面运行时启用后可用/);

    const { __test__createTryRenderContentPreset } = await import(url('modules/content-presets/renderer.js'));
    const renderDisabled = __test__createTryRenderContentPreset({
        isContentPresetFullPageRuntimeEnabled: () => false,
        getContentPresetIndexSnapshot: failIfCalled('关闭态 renderer index'),
        getPresetRecord: failIfCalled('关闭态 preset record'),
    });
    assert.equal(
        await renderDisabled(null, null),
        false,
        '注入关闭态时 renderer 必须在校验页面、目标和索引前拒绝接管',
    );
}

async function checkSettingsGate(gate) {
    const { buildSettingsHomePageHtml } = await import(url('modules/settings-app/layout/page-builders/overview-builders.js'));
    const baseArgs = {
        apiAvailability: { ok: true, message: '' },
        quickPresetOptions: '',
        apiPresetQuickOptions: '',
    };
    const enabledHtml = buildSettingsHomePageHtml(baseArgs);
    assert.equal(enabledHtml.includes('data-entry="beautify"'), true, '生产开启态设置首页必须输出 beautify 入口');
    assert.equal(enabledHtml.includes('模板工坊'), true, '生产开启态设置首页必须暴露模板工坊文案');
    const disabledHtml = buildSettingsHomePageHtml({ ...baseArgs, contentPresetFullPageRuntimeEnabled: false });
    assert.equal(disabledHtml.includes('data-entry="beautify"'), false, '注入关闭态设置首页不得输出 beautify 入口');
    assert.equal(disabledHtml.includes('模板工坊'), false, '注入关闭态设置首页不得暴露模板工坊文案');

    const settings = await import(url('modules/settings-app/render.js'));
    let availableCalls = 0;
    let unavailableCalls = 0;
    const available = { status: 'ready' };
    const unavailable = { status: 'unavailable' };
    const { normalizeSettingsMode, selectContentPresetWorkshop } = settings.__test__settingsGate;
    const selectedEnabled = selectContentPresetWorkshop(
        gate.isContentPresetFullPageRuntimeEnabled(),
        () => { availableCalls += 1; return available; },
        () => { unavailableCalls += 1; return unavailable; },
    );
    assert.strictEqual(selectedEnabled, available);
    assert.deepEqual({ availableCalls, unavailableCalls }, { availableCalls: 1, unavailableCalls: 0 });

    const selectedDisabled = selectContentPresetWorkshop(
        false,
        () => { availableCalls += 1; return available; },
        () => { unavailableCalls += 1; return unavailable; },
    );
    assert.strictEqual(selectedDisabled, unavailable);
    assert.deepEqual({ availableCalls, unavailableCalls }, { availableCalls: 1, unavailableCalls: 1 });
    assert.equal(normalizeSettingsMode('beautify', true), 'beautify');
    assert.equal(normalizeSettingsMode('beautify', false), 'home');
    assert.equal(normalizeSettingsMode('database', false), 'database');
}

async function main() {
    const gate = await import(url('modules/content-presets/activation-gate.js'));
    assert.equal(gate.isContentPresetFullPageRuntimeEnabled(), true, 'v2 Runtime gate 必须在 P1-P4 门禁完成后固定启用');

    await checkStartup(gate);
    await checkDisabledRuntimeBoundaries();
    await checkSettingsGate(gate);

    console.log('[content-presets-activation-gate-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-activation-gate-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
