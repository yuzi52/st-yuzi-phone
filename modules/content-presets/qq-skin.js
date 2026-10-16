import { createAssetRuntime } from './asset-runtime.js';
import { getActiveQQPreset } from './repository.js';
import { subscribeContentPresetIndex } from './index-state.js';
import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../settings.js';

let nextSkinId = 0;
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
    const record = await getActiveQQPreset(kind);
    const definition = record?.qq?.[kind];
    if (!definition) return null;
    mode ??= getPhoneSettings()?.phoneThemeMode;
    const file = mode === 'dark' && definition.darkCss ? definition.darkCss : definition.css;
    const assets = createAssetRuntime(record);
    let element = null; let root = null;
    try {
        const token = 'qq-skin-' + (++nextSkinId);
        const selector = '[data-qq-skin="' + token + '"]';
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(assets.rewriteCss(record.files[file].content, file));
        const css = scopedRules(sheet.cssRules, selector, kind);
        return {
            apply(target) {
                root = target; root.setAttribute('data-qq-skin', token);
                element = documentRef.createElement('style'); element.textContent = css; root.appendChild(element);
            },
            dispose() { element?.remove(); if (root?.getAttribute('data-qq-skin') === token) root.removeAttribute('data-qq-skin'); assets.dispose(); },
        };
    } catch (error) { assets.dispose(); throw error; }
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
