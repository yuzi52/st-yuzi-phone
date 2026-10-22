const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

class FakeWindow {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) { const values = this.listeners.get(type) || []; values.push(listener); this.listeners.set(type, values); }
    removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== listener)); }
    dispatchEvent(event) { for (const listener of [...(this.listeners.get(event.type) || [])]) listener(event); return true; }
}

async function main() {
    const previousWindow = global.window;
    const previousCustomEvent = global.CustomEvent;
    global.window = new FakeWindow();
    global.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
    try {
        const { PHONE_SETTINGS_UPDATED_EVENT } = await load('modules/settings.js');
        const { createContentPresetHostAppearance } = await load('modules/content-presets/host-appearance.js');
        let mode = 'light';
        let family = 'Alpha';
        const appearance = createContentPresetHostAppearance({
            getPhoneSettings: () => ({ phoneThemeMode: mode }),
            getAppearanceFontFamily: () => family,
        });
        const themeStates = [];
        const fontStates = [];
        const stopTheme = appearance.theme.subscribe(state => themeStates.push(state));
        const stopFont = appearance.font.subscribe(state => fontStates.push(state));
        mode = 'dark'; family = 'Beta';
        global.window.dispatchEvent(new global.CustomEvent(PHONE_SETTINGS_UPDATED_EVENT, { detail: { key: 'phoneThemeMode' } }));
        assert.deepEqual(themeStates, [{ mode: 'dark' }], '主题订阅必须在主设置事件后读取新状态');
        assert.deepEqual(fontStates, [], '主题变化不应重新读取字体');
        global.window.dispatchEvent(new global.CustomEvent(PHONE_SETTINGS_UPDATED_EVENT, { detail: { key: 'appearanceFontLibrary' } }));
        assert.deepEqual(fontStates, [{ family: 'Beta' }], '字体订阅必须在主设置事件后读取新状态');
        global.window.dispatchEvent(new global.CustomEvent(PHONE_SETTINGS_UPDATED_EVENT, { detail: { key: 'phoneContainerX' } }));
        assert.equal(themeStates.length, 1, '位置变化不应重新读取主题');
        assert.equal(fontStates.length, 1, '位置变化不应重新读取字体');
        mode = 'light'; family = 'Alpha';
        global.window.dispatchEvent(new global.CustomEvent(PHONE_SETTINGS_UPDATED_EVENT));
        assert.deepEqual(themeStates.at(-1), { mode: 'light' }, '整体重置仍刷新主题');
        assert.deepEqual(fontStates.at(-1), { family: 'Alpha' }, '整体重置仍刷新字体');
        stopTheme(); stopFont();
        mode = 'light';
        global.window.dispatchEvent(new global.CustomEvent(PHONE_SETTINGS_UPDATED_EVENT));
        assert.equal(themeStates.length, 2, '取消订阅后不得留下展示更新');
        console.log('[content-presets-host-appearance-settings-event] 通过');
    } finally {
        global.window = previousWindow;
        global.CustomEvent = previousCustomEvent;
    }
}
main().catch(error => {
    console.error('[content-presets-host-appearance-settings-event] 失败');
    console.error(error);
    process.exitCode = 1;
});
