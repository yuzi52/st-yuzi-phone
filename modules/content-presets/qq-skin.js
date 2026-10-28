import { createAssetRuntime } from './asset-runtime.js';
import { getActiveQQPreset } from './repository.js';
import { subscribeContentPresetIndex } from './index-state.js';
import { getContentPresetGeneration } from './mutation-coordinator.js';
import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../settings.js';

let nextSkinId = 0;
const preparedSkins = new Map();
let unsubscribeCacheIndex = null;
let cacheEpoch = 0;

function retireSkin(kind) {
    const skin = preparedSkins.get(kind);
    if (!skin) return;
    preparedSkins.delete(kind);
    skin.cached = false;
    if (!skin.users) skin.assets.dispose();
}

export function clearQQSkinCache() {
    cacheEpoch += 1;
    unsubscribeCacheIndex?.();
    unsubscribeCacheIndex = null;
    for (const kind of preparedSkins.keys()) retireSkin(kind);
}

function sameFiles(previous, current) {
    const paths = Object.keys(previous);
    return paths.length === Object.keys(current).length && paths.every(path => {
        const before = previous[path]; const after = current[path];
        return after && before.mimeType === after.mimeType
            && before.encoding === after.encoding && before.content === after.content;
    });
}

function watchCachedSkins() {
    unsubscribeCacheIndex ??= subscribeContentPresetIndex(snapshot => {
        for (const [kind, skin] of preparedSkins) {
            if (snapshot.changedPresetIds.includes(skin.presetId)
                || skin.generation !== getContentPresetGeneration('qq:' + kind)) retireSkin(kind);
        }
    });
}

function scopedRules(rules, selector, kind) {
    return Array.from(rules, rule => {
        if (rule.selectorText) {
            if (rule.cssRules?.length) throw new Error('QQ 美化请使用平铺 CSS 选择器，不使用嵌套规则');
            const target = rule.selectorText.replace(/:scope\b/g, selector);
            if (kind === 'popup' && /(?:^|;)\s*(?:position|inset(?:-[\w-]+)?|top|right|bottom|left|z-index|pointer-events|animation[\w-]*|transform)\s*:/i.test(rule.style.cssText)) throw new Error('QQ 浮窗美化不能接管位置、交互或播放动画');
            return selector + ':is(' + target + '), ' + selector + ' :is(' + target + ') {' + rule.style.cssText + '}';
        }
        if (rule.cssRules && /^@(media|supports)\b/.test(rule.cssText)) return rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + scopedRules(rule.cssRules, selector, kind) + '}';
        throw new Error('QQ 美化只支持样式、@media 和 @supports 规则');
    }).join('\n');
}
export async function prepareQQSkin(kind, { mode, documentRef = globalThis.document } = {}) {
    const epoch = cacheEpoch;
    const record = await getActiveQQPreset(kind);
    if (epoch !== cacheEpoch) return null;
    const definition = record?.qq?.[kind];
    if (!definition) { retireSkin(kind); return null; }
    mode ??= getPhoneSettings()?.phoneThemeMode;
    const file = mode === 'dark' && definition.darkCss ? definition.darkCss : definition.css;
    let skin = preparedSkins.get(kind);
    // Re-read the record: runtime asset writes need not publish an index change.
    if (!skin || skin.presetId !== record.id || skin.file !== file || !sameFiles(skin.files, record.files)) {
        retireSkin(kind);
        const assets = createAssetRuntime(record);
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(assets.rewriteCss(record.files[file].content, file));
            skin = { presetId: record.id, file, files: record.files, assets,
                rules: sheet.cssRules, users: 0, cached: true,
                generation: getContentPresetGeneration('qq:' + kind) };
            // Only the current theme and notification skin survive leaving QQ.
            preparedSkins.set(kind, skin);
            watchCachedSkins();
        } catch (error) { assets.dispose(); throw error; }
    }
    const token = 'qq-skin-' + (++nextSkinId);
    let css;
    try { css = scopedRules(skin.rules, '[data-qq-skin="' + token + '"]', kind); }
    catch (error) { retireSkin(kind); throw error; }
    skin.users += 1;
    let element = null; let root = null; let disposed = false;
    return {
        apply(target) {
            if (disposed) return;
            root = target; root.setAttribute('data-qq-skin', token);
            element = documentRef.createElement('style'); element.textContent = css; root.appendChild(element);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            element?.remove();
            if (root?.getAttribute('data-qq-skin') === token) root.removeAttribute('data-qq-skin');
            skin.users -= 1;
            if (!skin.cached && !skin.users) skin.assets.dispose();
        },
    };
}
export function mountQQSkin(root, kind, onError = () => {}) {
    let disposed = false; let epoch = 0; let current = null;
    let mode;
    const refresh = async () => {
        if (!globalThis.indexedDB) return;
        mode = getPhoneSettings()?.phoneThemeMode;
        const token = ++epoch;
        try {
            const next = await prepareQQSkin(kind, { mode });
            if (disposed || token !== epoch) { next?.dispose(); return; }
            current?.dispose(); current = next; current?.apply(root);
        } catch (error) { if (!disposed && token === epoch) { current?.dispose(); current = null; onError(error); } }
    };
    const unsubscribe = subscribeContentPresetIndex(refresh);
    const unsubscribeSettings = subscribePhoneSettingsUpdates(({ key }) => {
        if (key && key !== 'phoneThemeMode') return;
        const nextMode = getPhoneSettings()?.phoneThemeMode;
        if (mode === nextMode) return;
        mode = nextMode;
        void refresh();
    });
    return {
        ready: refresh(),
        dispose() { disposed = true; epoch += 1; unsubscribe(); unsubscribeSettings(); current?.dispose(); },
    };
}
