import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../settings.js';
import { createBottomVisualization } from './runtime.js';
import { isBottomVisualizationSetting } from './settings.js';

let releaseSettings = null;
let instance = null;
let suspended = false;
function refresh({ key } = {}) {
    // 主面板还拥有扩展启停和编辑卡片的通用表格样式。
    if (!isBottomVisualizationSetting(key) && ![
        'enabled', 'yuziPhoneBeautifyTemplates', 'beautifyTemplateSourceModeGeneric', 'beautifyActiveTemplateIdGeneric',
    ].includes(key)) return;
    const settings = getPhoneSettings();
    if (suspended || settings.enabled === false || !settings.bottomVisualization.enabled) {
        instance?.dispose(); instance = null;
    } else if (!instance) instance = createBottomVisualization();
    else instance.refresh();
}
export function startBottomVisualization() {
    if (typeof document === 'undefined') return;
    if (!releaseSettings) releaseSettings = subscribePhoneSettingsUpdates(refresh);
    refresh();
}
export function suspendBottomVisualization() {
    suspended = true;
    instance?.dispose(); instance = null;
}
export function resumeBottomVisualization() {
    suspended = false;
    if (releaseSettings) refresh();
}
export function stopBottomVisualization() {
    suspended = false;
    releaseSettings?.(); releaseSettings = null;
    instance?.dispose(); instance = null;
}
