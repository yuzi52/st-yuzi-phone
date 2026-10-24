import { t } from '../i18n/index.js';
import { acquireCurrentViewingSheet, releaseCurrentViewingSheet, subscribeTableUpdate } from '../phone-core/callbacks.js';
import { getTableData } from '../phone-core/data-api.js';
import { registerRoutePageCleanup } from '../phone-core/route-page-lifecycle.js';
import { getPhoneCoreState } from '../phone-core/state.js';
import { buildTableNavigationControlState } from '../table-navigation/controls.js';
import { resolveStableChatId } from '../integration/chat-identity.js';
import { isContentPresetFullPageRuntimeEnabled } from './activation-gate.js';
import { createAssetRuntime } from './asset-runtime.js';
import {
    createContentPresetAppearanceBridge,
    createContentPresetHostAppearance,
} from './host-appearance.js';
import { contentPresetImageGenerationHost } from './image-generation-host.js';
import { getContentPresetIndexSnapshot } from './index-state.js';
import { createContentPresetInstance } from './instance-coordinator.js';
import { matchesPresetItem } from './matcher.js';
import { createPresetAssetsRuntime } from './preset-assets.js';
import { getPresetRecord } from './repository.js';
import { createContentPresetActions } from './runtime-actions.js';
import { createContentPresetRuntimeContextController } from './runtime-context.js';
import { importContentPresetModule, invokeContentPresetMount } from './script-runtime.js';
import { contentPresetScrollRegistry } from './scroll-registry.js';
import { createPresetStateSnapshot, createTableSnapshot } from './snapshot.js';

const contentPresetHostAppearance = createContentPresetHostAppearance();
let styleScopeSequence = 0;

function scopePageStyle(root, style) {
    if (!document.head || typeof root.setAttribute !== 'function') return;
    const scope = `yuzi-preset-${++styleScopeSequence}`;
    root.setAttribute('data-yuzi-preset-scope', scope);
    const source = style.textContent;
    const media = style.media;
    style.media = 'not all';
    style.textContent = `@scope ([data-yuzi-preset-scope="${scope}"]) {${source}}`;
    // Parse without applying it globally, even while the phone page is detached.
    document.head.append(style);
    try {
        const scopeRule = style.sheet?.cssRules?.[0];
        // ponytail: older browsers retain legacy CSS; drop this fallback when @scope is the minimum baseline.
        if (!scopeRule?.cssRules || !scopeRule.cssText.startsWith('@scope')) style.textContent = source;
        else {
            const normalizeSelectors = rules => {
                for (const rule of rules) {
                    if (rule.selectorText) rule.selectorText = rule.selectorText.replace(/:root\b|:host\b(?![-(])/g, ':scope');
                    if (rule.cssRules) normalizeSelectors(rule.cssRules);
                }
            };
            normalizeSelectors(scopeRule.cssRules);
            style.textContent = scopeRule.cssText;
        }
    } finally {
        style.remove();
        style.media = media;
    }
}

function fileText(record, path) {
    const file = path ? record.files?.[path] : null;
    if (!file) return '';
    if (file.encoding !== 'base64') return String(file.content ?? '');
    const binary = atob(file.content);
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

const DEFAULT_RUNTIME_DEPS = Object.freeze({
    acquireCurrentViewingSheet,
    contentPresetScrollRegistry,
    createAssetRuntime,
    createContentPresetAppearanceBridge,
    createContentPresetActions,
    createContentPresetInstance,
    createContentPresetRuntimeContextController,
    createPresetAssetsRuntime,
    contentPresetHostAppearance,
    contentPresetImageGenerationHost,
    getContentPresetIndexSnapshot,
    getPhoneCoreState,
    getPresetRecord,
    getTableData,
    importContentPresetModule,
    invokeContentPresetMount,
    isContentPresetFullPageRuntimeEnabled,
    matchesPresetItem,
    registerRoutePageCleanup,
    releaseCurrentViewingSheet,
    resolveStableChatId,
    subscribeTableUpdate,
});

function createState(rawData, sheetKey, route, version, navigationEnabled = true) {
    return createPresetStateSnapshot({
        rawData,
        sheetKey,
        route,
        version,
        navigationState: navigationEnabled ? buildTableNavigationControlState(rawData, sheetKey) : { previous: { disabled: true }, next: { disabled: true } },
    });
}

export function __test__createTryRenderContentPreset(overrides = {}) {
    const runtimeDeps = { ...DEFAULT_RUNTIME_DEPS, ...overrides };
    const isActiveTokenForRuntime = renderToken => !Number.isFinite(renderToken)
        || runtimeDeps.getPhoneCoreState().routeRenderToken === renderToken;

    return async function tryRenderContentPreset(page, target, options = {}) {
    if (!runtimeDeps.isContentPresetFullPageRuntimeEnabled()) return false;
    const bottom = options.surface === 'bottom';
    const indexSnapshot = runtimeDeps.getContentPresetIndexSnapshot();
    const binding = bottom ? options.binding : indexSnapshot.status === 'ready'
        ? indexSnapshot.activeByTable.get(target?.sheetKey)
        : null;
    if (!binding || !(page instanceof HTMLElement) || !target?.sheetKey) return false;

    let version = 0;
    let initialState;
    try {
        initialState = createState(
            options.initialTableData || runtimeDeps.getTableData(),
            target.sheetKey,
            target.route,
            version,
            !bottom,
        );
    } catch {
        return false;
    }
    if (!initialState) return false;

    const root = document.createElement('div');
    root.className = 'phone-content-preset-root';
    page.replaceChildren(root);
    let owner = null;
    let assetRuntime = null;
    let presetAssets = null;
    let moduleRuntime = null;
    let contextController = null;
    let releaseAppearance = () => {};
    let unsubscribeTableUpdate = () => {};
    let unregisterPageCleanup = () => {};
    let cancelScrollRestore = () => {};
    let instance = null;
    let fallbackStarted = false;
    let committed = false;
    const scrollKey = { surface: bottom ? 'bottom' : 'page', chatId: '', sheetKey: target.sheetKey, presetId: binding.presetId, itemId: binding.itemId };
    const cleanup = () => {
        unregisterPageCleanup(); unregisterPageCleanup = () => {};
        unsubscribeTableUpdate(); unsubscribeTableUpdate = () => {};
        cancelScrollRestore(); cancelScrollRestore = () => {};
        releaseAppearance(); releaseAppearance = () => {};
        contextController?.dispose(); contextController = null;
        moduleRuntime?.disposeModuleUrl(); moduleRuntime = null;
        presetAssets?.dispose(); presetAssets = null;
        assetRuntime?.dispose(); assetRuntime = null;
        runtimeDeps.releaseCurrentViewingSheet(owner); owner = null;
        root.remove();
    };
    const isCurrent = () => instance?.isCurrent(bottom ? undefined : runtimeDeps.getPhoneCoreState().routeRenderToken) === true;
    const fallback = () => {
        if (fallbackStarted || !isCurrent()) return;
        fallbackStarted = true;
        instance.dispose();
        options.originalRenderer?.(page);
    };

    try {
        if (!bottom) owner = runtimeDeps.acquireCurrentViewingSheet(target.sheetKey);
        instance = runtimeDeps.createContentPresetInstance({
            surface: bottom ? 'bottom' : 'page',
            sheetKey: target.sheetKey,
            routeToken: bottom ? undefined : options.renderToken,
            isPageOwner: bottom ? options.isCurrent : () => isActiveTokenForRuntime(options.renderToken),
            onStopUpdates: () => contextController?.dispose(),
            onCaptureScroll: () => { if (committed && scrollKey.chatId) runtimeDeps.contentPresetScrollRegistry.write(scrollKey, root.scrollTop); },
            onHostCleanup: cleanup,
        });
        options.onInstance?.(instance);
        unregisterPageCleanup = runtimeDeps.registerRoutePageCleanup(page, () => instance.dispose());
        instance.transition('importing');
        const record = await runtimeDeps.getPresetRecord(binding.presetId);
        const item = record?.items?.find(entry => entry.id === binding.itemId);
        if (!item?.activatable || !runtimeDeps.matchesPresetItem(item, { tableName: initialState.tableName, headers: createTableSnapshot(runtimeDeps.getTableData(), target.sheetKey, { includeRows: false })?.rawHeaders })) throw new Error(t("绑定项已失效"));
        if (!isCurrent()) { instance.dispose(); return true; }

        assetRuntime = runtimeDeps.createAssetRuntime(record);
        presetAssets = runtimeDeps.createPresetAssetsRuntime(record.id);
        const html = fileText(record, item.entry.html);
        const css = fileText(record, item.entry.css);
        root.innerHTML = html ? assetRuntime.rewriteHtml(html, item.entry.html) : '';
        if (css) {
            const style = document.createElement('style');
            style.textContent = assetRuntime.rewriteCss(css, item.entry.css);
            scopePageStyle(root, style);
            root.prepend(style);
        }
        releaseAppearance = runtimeDeps.createContentPresetAppearanceBridge(
            root,
            item,
            runtimeDeps.contentPresetHostAppearance,
        );
        scrollKey.chatId = runtimeDeps.resolveStableChatId();
        const actions = runtimeDeps.createContentPresetActions({
            sheetKey: target.sheetKey,
            disabled: bottom,
            getRoute: () => bottom ? target.route : runtimeDeps.getPhoneCoreState().currentRoute,
            isCurrent,
        });
        const imageActions = runtimeDeps.contentPresetImageGenerationHost?.createPageActions?.({
            item,
            presetId: binding.presetId,
            itemId: binding.itemId,
            sheetKey: target.sheetKey,
            isCurrent,
        }) || {};
        contextController = runtimeDeps.createContentPresetRuntimeContextController({
            root,
            signal: instance.signal,
            initialState,
            actions: Object.freeze({ ...actions, ...imageActions }),
            presetAssets,
            resolveAsset: assetRuntime.resolveAsset,
        });
        moduleRuntime = await runtimeDeps.importContentPresetModule({ source: fileText(record, item.entry.mount), signal: instance.signal, importModule: options.importModule });
        if (!isCurrent()) { instance.dispose(); return true; }
        instance.transition('mounting');
        const disposer = await runtimeDeps.invokeContentPresetMount({
            mount: moduleRuntime.mount,
            context: contextController.context,
            signal: instance.signal,
            onLateDisposer: lateDisposer => instance.setAuthorDisposer(lateDisposer),
        });
        instance.setAuthorDisposer(disposer);
        if (!isCurrent()) { instance.dispose(); return true; }
        instance.transition('active');
        committed = true;
        try {
            options.onCommitted?.();
        } catch {}
        try {
            unsubscribeTableUpdate = runtimeDeps.subscribeTableUpdate(() => {
                if (!isCurrent()) return;
                try {
                    const rawData = runtimeDeps.getTableData();
                    const nextTable = createTableSnapshot(rawData, target.sheetKey, { includeRows: false });
                    if (!nextTable || !runtimeDeps.matchesPresetItem(item, { tableName: nextTable.tableName, headers: nextTable.rawHeaders })) {
                        if (bottom) fallback();
                        return;
                    }
                    version += 1;
                    contextController.publish(createState(rawData, target.sheetKey, target.route, version, !bottom), 'table-data');
                } catch {}
            }) || (() => {});
        } catch {}
        try {
            if (scrollKey.chatId) cancelScrollRestore = runtimeDeps.contentPresetScrollRegistry.restore(root, scrollKey, isCurrent);
        } catch {}
        return true;
    } catch {
        if (!instance) cleanup();
        else if (!committed) fallback();
        return true;
    }
    };
}

export const tryRenderContentPreset = __test__createTryRenderContentPreset();
