import { escapeHtml } from '../utils/dom-escape.js';
import { importContentPresetModule, invokeContentPresetMount } from '../content-presets/script-runtime.js';
import { timeBarModule } from './time-bar.js';

export const BODY_MODULE_FORMAT = 'yuzi-body-modules';
export const BODY_MODULE_BYTES = 32 * 1024 * 1024;
export const BODY_MODULE_KEY = 'beautifyModules';
export const BODY_TIME_ID = 'builtin-time-bar';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keyPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const own = (value, key) => Object.hasOwn(value, key);
const text = (value, label) => {
    if (typeof value !== 'string') throw new Error(`${label}必须是文字`);
    return value;
};
const prompt = (value, label) => {
    if (!object(value)) throw new Error(`${label}需要 default 和 value`);
    const fallback = text(value.default, `${label}.default`);
    return { default: fallback, value: value.value === undefined ? fallback : text(value.value, `${label}.value`) };
};

// Data validation never evaluates an imported script. A disabled module is inert.
export function validateBodyModule(source) {
    if (!object(source)) throw new Error('模块必须是对象');
    const name = text(source.name, '模块名称').trim();
    if (!name) throw new Error('模块名称不能为空');
    try {
        if (!object(source.match)) throw new Error('缺少 match 识别声明');
        const pattern = text(source.match.pattern, 'match.pattern');
        const flags = source.match.flags === undefined ? 'gu' : text(source.match.flags, 'match.flags');
        if (!pattern || /[^gimsu]/u.test(flags) || new Set(flags).size !== flags.length) throw new Error('识别表达式或 flags 无效');
        new RegExp(pattern, flags);
        const controls = source.controls === undefined ? [] : source.controls;
        if (!Array.isArray(controls)) throw new Error('controls 必须是开关数组');
        const ids = new Set();
        const normalizedControls = controls.map(control => {
            if (!object(control) || typeof control.id !== 'string' || !keyPattern.test(control.id) || ids.has(control.id)) throw new Error('开关 id 必须是唯一的英文字母开头标识');
            ids.add(control.id);
            if (typeof control.default !== 'boolean' || (control.value !== undefined && typeof control.value !== 'boolean')) throw new Error('开关 default/value 必须是布尔值');
            return { id: control.id, label: text(control.label, '开关名称'), default: control.default, value: control.value ?? control.default,
                ...(control.description === undefined ? {} : { description: text(control.description, '开关说明') }),
                ...(control.prompt === undefined ? {} : { prompt: prompt(control.prompt, '开关提示词') }) };
        });
        const assets = source.assets === undefined ? {} : source.assets;
        if (!object(assets)) throw new Error('assets 必须是素材名称与 data URL 的对应对象');
        for (const [key, value] of Object.entries(assets)) {
            if (!keyPattern.test(key) || typeof value !== 'string' || !/^data:(image\/(?:png|jpeg|gif|webp|avif)|font\/(?:woff2?|ttf|otf));base64,[A-Za-z0-9+/=\r\n]+$/u.test(value)) {
                throw new Error(`素材 ${key} 需要内嵌图片或字体 data URL`);
            }
        }
        const html = text(source.html, 'html'), css = text(source.css === undefined ? '' : source.css, 'css'), script = text(source.script === undefined ? '' : source.script, 'script');
        // Assets must travel with the file, rather than becoming broken local references.
        for (const match of `${html}\n${css}`.matchAll(/\{\{asset:([\w-]+)\}\}/gu)) {
            if (!own(assets, match[1])) throw new Error(`缺少素材：${match[1]}`);
        }
        if (source.guide !== undefined && !object(source.guide)) throw new Error('guide 必须是说明对象');
        return { name, description: text(source.description === undefined ? '' : source.description, 'description'), prompt: prompt(source.prompt, '模块提示词'),
            match: { pattern, flags }, controls: normalizedControls, html, css, script, assets: { ...assets },
            ...(source.guide ? { guide: structuredClone(source.guide) } : {}) };
    } catch (error) { throw new Error(`${name}：${error.message}`); }
}

export function normalizeBodyModuleLibrary(saved) {
    const entries = Array.isArray(saved) ? saved : [];
    const previous = entries.find(entry => entry.id === BODY_TIME_ID);
    const builtin = structuredClone(timeBarModule);
    if (previous) {
        if (typeof previous.prompt?.value === 'string') builtin.prompt.value = previous.prompt.value;
        for (const control of builtin.controls) {
            const old = previous.controls?.find(item => item.id === control.id);
            if (typeof old?.value === 'boolean') control.value = old.value;
        }
    }
    return [{ ...builtin, id: BODY_TIME_ID, enabled: previous?.enabled === true },
        ...entries.filter(entry => entry.id !== BODY_TIME_ID).map(entry => ({ ...entry,
            match: { pattern: entry.match.pattern, flags: entry.match.flags } }))];
}

export function readBodyModulePack(source) {
    if (typeof source !== 'string' || new Blob([source]).size > BODY_MODULE_BYTES) throw new Error('模块文件不能超过 32MB');
    let pack;
    try { pack = JSON.parse(source); } catch { throw new Error('文件不是有效的 JSON'); }
    if (!object(pack) || pack.format !== BODY_MODULE_FORMAT || pack.version !== 1 || !Array.isArray(pack.modules) || !pack.modules.length) {
        throw new Error('不是支持的正文美化模块文件');
    }
    // Validate every entry before allocating IDs or opening a write transaction.
    return pack.modules.map(validateBodyModule).map((module, index) => ({ ...module,
        id: globalThis.crypto?.randomUUID?.() || `module-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`, enabled: false }));
}

export function exportBodyModulePack(entries) {
    return { format: BODY_MODULE_FORMAT, version: 1,
        readme: {
            start: '这是玉子手机正文美化模块包。无需小手机源码或构建工具；直接编辑本 JSON，保留 format/version/modules，再从 设置 → 正文对话气泡 → 导入模块 导入。所有新副本默认关闭，同名也新增，不覆盖。',
            authoring: '先阅读内置时间栏的 guide，再复制它或最小示例作为新模块。可删除 modules 中不想分享的项。改 name、prompt、match、html/css/script、controls 即可创造独立正文模块。不要把说明文字当成可执行脚本。',
            boundaries: '只追加提示词，不修改已有对白协议。不包含人物、TTS、连接或聊天数据。模块脚本只在启用后加载；它是可信作者代码，和现有内容预设一样不是安全沙箱，请仅启用可信来源。',
        },
        modules: entries.map(validateBodyModule),
    };
}

export function bodyModulePrompt(entries = []) {
    return entries.filter(entry => entry.enabled).flatMap(entry => [entry.prompt.value,
        ...entry.controls.filter(control => control.value && control.prompt).map(control => control.prompt.value)]).filter(Boolean).join('\n\n');
}
const optionValues = entry => Object.fromEntries(entry.controls.map(control => [control.id, control.value]));

export async function prepareBodyModules(entries, report) {
    return (await Promise.all(entries.filter(entry => entry.enabled).map(async entry => {
        try {
            const code = entry.script ? await importContentPresetModule({ source: entry.script, requireMount: false }) : null;
            code?.disposeModuleUrl();
            const regex = new RegExp(entry.match.pattern, [...new Set(`${entry.match.flags}g`)].join(''));
            return { entry, regex, code, options: optionValues(entry), report };
        } catch (error) { report(entry.id, error); return null; }
    }))).filter(Boolean);
}

export function matchBodyModules(text, modules, reserved = []) {
    const matches = [...reserved];
    for (const module of modules) {
        const { entry, regex, code, options, report } = module;
        if (module.failed) continue;
        try {
            regex.lastIndex = 0;
            let parsed = [...text.matchAll(regex)].filter(match => match[0].length).map(match => ({
                start: match.index, end: match.index + match[0].length, data: { ...match.groups },
            }));
            if (code?.parse) parsed = code.parse({ text, matches: parsed, options: { ...options } });
            if (!Array.isArray(parsed)) throw new Error('parse 必须同步返回匹配数组');
            const accepted = [];
            for (const match of parsed) {
                if (!object(match) || !Number.isInteger(match.start) || !Number.isInteger(match.end)
                    || match.start < 0 || match.end > text.length || match.end <= match.start || !object(match.data)) throw new Error('parse 返回了无效的文字范围或 data');
                if (matches.some(old => match.start < old.end && match.end > old.start)
                    || accepted.some(old => match.start < old.end && match.end > old.start)) continue;
                accepted.push({ ...match, raw: text.slice(match.start, match.end), module });
            }
            matches.push(...accepted);
        } catch (error) { module.failed = true; report(entry.id, error); }
    }
    return matches.sort((a, b) => a.start - b.start);
}

export function createBodyModuleView(match) {
    const { entry, code, options, report } = match.module;
    const node = document.createElement('span');
    node.className = 'yuzi-body-module-view'; node.dataset.yuziBodyModule = entry.id;
    const root = node.attachShadow({ mode: 'open' });
    const assets = value => value.replace(/\{\{asset:([\w-]+)\}\}/gu, (_, key) => entry.assets[key]);
    const style = document.createElement('style'); style.textContent = assets(entry.css);
    const content = document.createElement('div');
    content.innerHTML = assets(entry.html).replace(/\{\{([\w-]+)\}\}/gu, (_, key) => escapeHtml(String(own(match.data, key) ? match.data[key] ?? '' : '')));
    root.append(style, content);
    const controller = new AbortController();
    let cleanup = null, alive = true;
    const context = { root: content, data: structuredClone(match.data), raw: match.raw, options: { ...options },
        assets: { ...entry.assets }, signal: controller.signal, onCleanup(callback) {
            if (typeof callback !== 'function') return;
            controller.signal.addEventListener('abort', callback, { once: true });
            if (controller.signal.aborted) callback();
        } };
    return {
        node, updateStyle() {},
        mount(onFailure) {
            if (!code?.mount) return;
            void invokeContentPresetMount({ mount: context => alive ? code.mount(context) : undefined, context, signal: controller.signal,
                onLateDisposer: dispose => { try { dispose(); } catch (error) { console.warn('[正文美化模块] 清理失败', error); } },
            }).then(dispose => {
                if (alive) cleanup = dispose;
                else dispose?.();
            }).catch(error => { if (alive) { match.module.failed = true; report(entry.id, error); onFailure(); } });
        },
        dispose() {
            if (!alive) return;
            alive = false; controller.abort();
            try { cleanup?.(); } catch (error) { console.warn('[正文美化模块] 清理失败', error); }
        },
    };
}
