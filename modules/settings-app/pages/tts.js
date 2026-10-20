import { t } from '../../i18n/index.js';
import { escapeHtml as esc, escapeHtmlAttr as attr } from '../../utils/dom-escape.js';
import { getQQV2Facade } from '../../qq-v2/runtime/default-runtime.js';
import { createVoicePlaybackController } from '../../qq-v2/voice/playback.js';
import { QQ_VOICE_CATEGORIES, QQ_VOICE_PACK_TYPE, QQ_VOICE_PACK_VERSION } from '../../qq-v2/voice/library.js';
import { normalizeQQVoiceSettings } from '../../qq-v2/voice/settings.js';
import { buildSettingsPageFrame } from '../layout/primitives.js';
import { showSettingsSheet, showSettingsActionSheet, showSettingsOptionSheet } from '../ui/settings-layer.js';
import { bindSettingsGroupedControls } from '../ui/settings-controls.js';
import { createScrollPreserver } from '../ui/settings-scroll-binding.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';

const field = (name, label, value, type = 'text', required = false) => `
    <label class="phone-ios-row is-block">
        <span class="phone-ios-field-label">${esc(label)}</span>
        <input class="phone-ios-field" name="${attr(name)}" type="${type}" value="${attr(value)}"
            autocomplete="off" ${required ? 'required' : ''}>
    </label>`;
const action = (name, label, danger = false) => `<button type="button" class="phone-ios-row is-tappable${danger ? ' is-danger' : ''}" data-tts-action="${attr(name)}">
    <span class="phone-ios-row-label">${esc(label)}</span><span class="phone-ios-row-chevron" aria-hidden="true">›</span></button>`;
const section = (title, body, name = '') => `<h2 class="phone-ios-group-header" ${name ? `data-tts-section="${attr(name)}"` : ''}>${esc(title)}</h2><section class="phone-ios-group">${body}</section>`;
const selection = (name, label, value, hidden = false) => `<button type="button" class="phone-ios-row is-tappable" data-tts-action="${attr(name)}" aria-haspopup="dialog" ${hidden ? 'hidden' : ''}>
    <span class="phone-ios-row-label">${esc(label)}</span><span class="phone-ios-row-value"><span class="phone-ios-row-value-text">${esc(value)}</span><span class="phone-ios-row-chevron" aria-hidden="true">›</span></span></button>`;
const createDraft = (preset = {}) => ({
    ...normalizeQQVoiceSettings(preset), presetId: preset.presetId || '', name: preset.name || '', apiKey: '',
});

/** 设置页只持有编辑状态；连接、密钥、仓库仍由 QQ 的公开接口管理。 */
export function createTtsPage({ container, state, render: renderSettings, pageRuntime }) {
    const facade = getQQV2Facade();
    let disposed = false;
    let busy = false;
    let presets = [];
    let selectedPresetId = '';
    let entries = [];
    let draft = null;
    let models = [];
    let modelStatus = '';
    let modelError = false;
    let modelController = null;
    let previewDraft = { voiceId: '', text: '你好，很高兴认识你。' };
    const draftPreset = () => presets.find(preset => preset.presetId === draft?.presetId);
    const keyStatus = () => draftPreset()?.apiKeySaved ? t("密钥已保存；留空保留原密钥。") : t("接口需兼容 Fish 请求格式。");
    const toast = (message, error = false) => {
        if (!disposed) showToast(container, message, error, pageRuntime);
    };
    const playback = createVoicePlaybackController({ report: () => toast(t("试听失败"), true) });
    const checked = result => {
        if (!result?.ok) throw Object.assign(new Error(result?.error?.message || t("操作失败")), { code: result?.error?.code });
        return result;
    };
    const capture = () => {
        const form = container.querySelector('[data-tts-connection]');
        if (form) draft = { ...draft, name: form.elements.name.value, baseUrl: form.elements.baseUrl.value, model: form.elements.model.value,
            apiKey: form.elements.apiKey.value, directFetch: form.elements.directFetch.checked };
        const preview = container.querySelector('[data-tts-preview]');
        if (preview) previewDraft = { voiceId: preview.elements.voiceId.value, text: preview.elements.text.value };
    };
    const applyPresets = config => {
        presets = config.presets;
        selectedPresetId = config.selectedPresetId;
        draft ||= createDraft(presets.find(preset => preset.presetId === selectedPresetId));
    };
    const syncBusyControls = () => {
        if (disposed) return;
        container.querySelectorAll('.phone-app-body input, .phone-app-body button').forEach(element => {
            element.disabled = busy || (element.dataset.ttsAction === 'delete-preset' && !draft?.presetId);
        });
        container.querySelector('[data-tts-connection]')?.setAttribute('aria-busy', String(busy));
    };
    const syncConnectionControls = () => {
        const form = container.querySelector('[data-tts-connection]');
        for (const name of ['name', 'baseUrl', 'model', 'apiKey']) {
            form.elements[name].value = draft[name];
            form.elements[name].defaultValue = draft[name];
        }
        form.elements.directFetch.checked = draft.directFetch;
        container.querySelector('[data-tts-action="select-preset"] .phone-ios-row-value-text').textContent =
            presets.find(preset => preset.presetId === selectedPresetId)?.name || t("未配置");
        container.querySelector('[data-tts-section="connection"]').textContent =
            draft.presetId ? t("编辑 TTS 预设") : t("新建 TTS 预设");
        container.querySelector('[data-tts-key-status]').textContent = keyStatus();
        container.querySelector('[data-tts-preview-status]').textContent = '';
        syncModelControls();
    };
    const load = async () => {
        const [config, library] = await Promise.all([facade.query.voicePresets(), facade.query.voiceLibrary()]);
        checked(config); checked(library);
        if (disposed) return;
        applyPresets(config);
        entries = library.entries;
        render();
    };
    const run = async (operation, success = t("已保存")) => {
        if (busy || disposed) return;
        capture();
        busy = true;
        syncBusyControls();
        let message = success;
        let failed = false;
        try {
            const result = checked(await operation());
            if (disposed) return;
            if (Array.isArray(result.presets)) {
                applyPresets(result);
                syncConnectionControls();
            } else {
                await load();
            }
        } catch (error) {
            message = error?.message || t("操作失败");
            failed = true;
        } finally {
            busy = false;
            syncBusyControls();
        }
        if (message) toast(message, failed);
    };
    const resetModels = () => { models = []; modelStatus = ''; modelError = false; };
    const pickPreset = () => showSettingsOptionSheet({
        title: t("选择 TTS 预设"), runtime: pageRuntime, className: 'phone-settings-page',
        groups: [{ options: presets.map(preset => ({
            value: preset.presetId, label: preset.name, selected: preset.presetId === selectedPresetId,
        })) }],
        footer: presets.length ? '' : t("暂无预设，请先新建并保存"),
        onSelect: presetId => {
            if (disposed || busy) return;
            void run(async () => {
                const result = checked(await facade.intent.selectVoicePreset({ presetId }));
                if (!disposed) { draft = null; resetModels(); playback.stop(); }
                return result;
            }, t("已切换预设"));
        },
    });
    const syncModelControls = () => {
        if (disposed) return;
        const button = container.querySelector('[data-tts-action="load-models"]');
        const list = container.querySelector('[data-tts-action="select-model"]');
        const status = container.querySelector('[data-tts-model-status]');
        const model = container.querySelector('[data-tts-connection]')?.elements.model.value ?? draft.model;
        button.disabled = busy;
        button.setAttribute('aria-busy', String(busy));
        list.hidden = !models.length;
        list.disabled = busy;
        list.querySelector('.phone-ios-row-value-text').textContent = models.includes(model) ? model : t("请选择模型");
        status.hidden = !modelStatus;
        status.classList.toggle('phone-api-preset-error', modelError);
        status.setAttribute('role', modelError ? 'alert' : 'status');
        status.textContent = modelStatus;
    };
    const pickModel = () => showSettingsOptionSheet({
        title: t("选择模型"), runtime: pageRuntime, className: 'phone-settings-page',
        groups: [{ options: models.map(model => ({ value: model, label: model, selected: model === draft.model })) }],
        onSelect: model => {
            if (disposed || busy) return;
            draft.model = model;
            container.querySelector('[data-tts-connection]').elements.model.value = model;
            syncModelControls();
        },
    });
    const loadModels = async () => {
        if (busy || disposed) return;
        capture();
        busy = true;
        modelError = false;
        modelStatus = t("正在加载模型...");
        modelController = new AbortController();
        syncModelControls();
        try {
            const result = checked(await facade.intent.loadVoiceModels({ draft, signal: modelController.signal }));
            if (disposed) return;
            models = result.models;
            modelStatus = result.source === 'official'
                ? t("官方模型名单；当前密钥是否可用，以试听结果为准。")
                : t`已加载 ${models.length} 个模型`;
        } catch (error) {
            if (disposed) return;
            modelError = true;
            modelStatus = error.message;
        } finally {
            modelController = null;
            busy = false;
            syncModelControls();
        }
    };
    const deletePreset = () => {
        const presetId = draft.presetId;
        showConfirmDialog(container, t("删除 TTS 预设"),
            t("删除当前预设后需重新选择。音色仓库和已生成的音频不受影响。"),
            () => void run(async () => {
                const result = checked(await facade.intent.deleteVoicePreset({ presetId }));
                if (!disposed) { draft = null; resetModels(); playback.stop(); }
                return result;
            }, t("已删除")), t("删除"), t("取消"), pageRuntime);
    };
    const editEntry = (entry = {}) => {
        capture();
        const categories = ['', ...Object.keys(QQ_VOICE_CATEGORIES)].map(value =>
            `<option value="${value}" ${value === (entry.category || '') ? 'selected' : ''}>${esc(t(QQ_VOICE_CATEGORIES[value] || "未分类"))}</option>`).join('');
        const categoryButtons = ['', ...Object.keys(QQ_VOICE_CATEGORIES)].map(value =>
            `<button type="button" class="phone-ios-seg-item" data-value="${value}">${esc(t(QQ_VOICE_CATEGORIES[value] || "未分类"))}</button>`).join('');
        let unbind = () => {};
        const sheet = showSettingsSheet({
            title: entry.entryId ? t("编辑音色") : t("新增音色"), runtime: pageRuntime,
            className: 'phone-settings-page',
            onClose: () => unbind(),
            bodyHtml: `<form data-tts-entry-editor><div class="phone-ios-group">
                ${field('name', t("名称"), entry.name || '', 'text', true)}
                ${field('voiceId', t("音色 ID"), entry.voiceId || '', 'text', true)}
                <div class="phone-ios-row is-block"><span class="phone-ios-field-label">${t("分类")}</span>
                    <select id="tts-entry-category" name="category" hidden>${categories}</select>
                    <div class="phone-ios-seg" data-settings-seg="tts-entry-category" role="group" aria-label="${t("分类")}">${categoryButtons}</div></div>
                ${field('note', t("备注"), entry.note || '')}
                <div class="phone-ios-row"><button type="submit" class="phone-ios-mini-btn">${t("保存")}</button></div>
            </div></form>`,
        });
        if (!sheet) return;
        unbind = bindSettingsGroupedControls(sheet.overlay, null, () => !disposed);
        sheet.bind(sheet.overlay.querySelector('form'), 'submit', event => {
            event.preventDefault();
            const form = event.currentTarget;
            if (!form.reportValidity() || busy) return;
            void run(async () => {
                const result = checked(await facade.intent.saveVoiceEntry({ entry: {
                    ...(entry.entryId ? { entryId: entry.entryId } : {}),
                    name: form.elements.name.value, voiceId: form.elements.voiceId.value,
                    category: form.elements.category.value, note: form.elements.note.value,
                } }));
                sheet.close();
                return result;
            });
        });
    };
    const entryActions = entry => showSettingsActionSheet({
        title: entry.name, runtime: pageRuntime, actions: [
            { label: t("编辑"), onSelect: () => editEntry(entry) },
            { label: t("删除"), danger: true, onSelect: () => void run(
                () => facade.intent.deleteVoiceEntry({ entryId: entry.entryId }), t("已删除"),
            ) },
        ],
    });
    const importFile = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file || disposed) return;
            void run(async () => {
                const source = JSON.parse(await file.text());
                return facade.intent.importVoicePack({ source, applySettings: false });
            }, t("已导入"));
        }, { once: true });
        input.click();
    };
    const exportFile = () => {
        capture();
        const pack = { type: QQ_VOICE_PACK_TYPE, version: QQ_VOICE_PACK_VERSION, library: entries };
        const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'tts-voices.json'; link.click();
        pageRuntime.setTimeout(() => URL.revokeObjectURL(url), 1000);
        pageRuntime.registerCleanup(() => URL.revokeObjectURL(url));
    };
    const preview = async () => {
        if (busy || disposed) return;
        capture();
        const status = container.querySelector('[data-tts-preview-status]');
        const button = container.querySelector('[data-tts-action="preview"]');
        if (!previewDraft.voiceId.trim() || !previewDraft.text.trim()) {
            status.textContent = t("请填写音色 ID 和试听文字");
            return;
        }
        const saved = draftPreset();
        if (!saved || draft.presetId !== selectedPresetId
            || draft.apiKey.trim() || ['name', 'baseUrl', 'model', 'directFetch'].some(key => draft[key] !== saved[key])) {
            status.textContent = t("请先保存预设后再试听");
            return;
        }
        if (!saved.apiKeySaved) {
            status.textContent = t("请先填写并保存密钥");
            return;
        }
        busy = true;
        button.disabled = true;
        status.textContent = t("试听中…");
        playback.stop();
        try {
            const result = checked(await facade.intent.previewVoice(previewDraft));
            const release = () => void facade.intent.releaseVoicePreview({ leaseId: result.render.leaseId });
            if (disposed) { release(); return; }
            await playback.play({ key: result.render.leaseId, url: result.render.url, release });
            status.textContent = t("试听成功");
        } catch {
            if (!disposed) status.textContent = t("试听失败");
        } finally {
            busy = false;
            if (!disposed) button.disabled = false;
        }
    };
    const renderPage = () => {
        if (disposed) return;
        container.innerHTML = buildSettingsPageFrame({
            title: 'TTS', bodyClass: 'phone-app-body phone-settings-scroll phone-ios-grouped-page',
            bodyHtml: draft ? section(t("TTS 预设"),
                selection('select-preset', t("选择预设"), presets.find(preset => preset.presetId === selectedPresetId)?.name || t("未配置"))
                + `<button type="button" class="phone-ios-row is-action" data-tts-action="new-preset">${t("新建 TTS 预设")}</button>`)
                + section(draft.presetId ? t("编辑 TTS 预设") : t("新建 TTS 预设"), `<form data-tts-connection>
                ${field('name', t("名称"), draft.name, 'text', true)}
                ${field('baseUrl', t("服务地址"), draft.baseUrl, 'url', true)}
                ${field('apiKey', t("密钥"), draft.apiKey, 'password')}
                ${field('model', t("模型"), draft.model, 'text', true)}
                ${selection('select-model', t("模型列表"), models.includes(draft.model) ? draft.model : t("请选择模型"), !models.length)}
                <label class="phone-ios-row">
                    <span class="phone-ios-row-label">${t("前端直连（不走酒馆代理）")}</span>
                    <span class="phone-ios-switch">
                        <input type="checkbox" name="directFetch" role="switch"
                            aria-label="${t("前端直连（不走酒馆代理）")}" ${draft.directFetch ? 'checked' : ''}>
                        <span class="phone-ios-switch-track" aria-hidden="true"></span>
                    </span>
                </label>
                <p class="phone-ios-group-footer">${t("建议关闭直连，通过酒馆转发；需启用 enableCorsProxy 并重启酒馆。")}</p>
                <button type="button" class="phone-ios-row is-action" data-tts-action="load-models">${t("加载模型")}</button>
                <button type="submit" class="phone-ios-row is-action">${t("保存预设")}</button>
                <button type="button" class="phone-ios-row is-action is-danger" data-tts-action="delete-preset" ${draft.presetId ? '' : 'disabled'}>${t("删除预设")}</button>
                <p class="phone-ios-group-footer" data-tts-key-status>${keyStatus()}</p>
                <p class="phone-ios-group-footer${modelError ? ' phone-api-preset-error' : ''}" data-tts-model-status role="${modelError ? 'alert' : 'status'}" ${modelStatus ? '' : 'hidden'}>${esc(modelStatus)}</p>
            </form>`, 'connection')
                + section(t("音色仓库"), entries.map(entry => action(`entry:${entry.entryId}`, entry.name)).join('')
                    + (entries.length ? '' : `<p class="phone-ios-group-footer">${t("仓库暂无音色")}</p>`) + action('add', t("新增音色")))
                + section(t("导入与导出"), action('import', t("导入音色仓库")) + action('export', t("导出音色仓库")))
                + section(t("试听"), `<form data-tts-preview>
                    ${field('voiceId', t("音色 ID"), previewDraft.voiceId)}
                    ${field('text', t("试听文字"), previewDraft.text)}
                    <div class="phone-ios-row"><button type="submit" class="phone-ios-mini-btn" data-tts-action="preview">${t("试听")}</button></div>
                    <p class="phone-ios-group-footer" data-tts-preview-status role="status" aria-live="polite"></p>
                </form>`) : '',
        });
        container.querySelector('[data-tts-connection]')?.addEventListener('submit', event => {
            event.preventDefault();
            if (!event.currentTarget.reportValidity()) return;
            void run(async () => {
                const result = checked(await facade.intent.saveVoicePreset({ preset: draft }));
                if (!disposed) draft = null;
                return result;
            }, t("预设已保存"));
        });
        container.querySelector('[data-tts-preview]')?.addEventListener('submit', event => {
            event.preventDefault(); void preview();
        });
        syncBusyControls();
    };
    const renderWithScroll = createScrollPreserver(container, state, undefined, pageRuntime)
        .createRerenderWithScroll('ttsScrollTop', renderPage);
    const render = () => { if (!disposed) renderWithScroll(); };
    const onClick = event => {
        if (event.target.closest('.phone-nav-back')) {
            state.mode = 'home';
            renderSettings();
            return;
        }
        const value = event.target.closest('[data-tts-action]')?.dataset.ttsAction;
        if (!value || value === 'preview' || busy) return;
        capture();
        if (value === 'select-preset') pickPreset();
        else if (value === 'new-preset') { draft = createDraft(); resetModels(); render(); }
        else if (value === 'delete-preset') deletePreset();
        else if (value === 'select-model') pickModel();
        else if (value === 'load-models') void loadModels();
        else if (value === 'add') editEntry();
        else if (value.startsWith('entry:')) {
            const entry = entries.find(item => item.entryId === value.slice(6));
            if (entry) entryActions(entry);
        } else if (value === 'import') importFile();
        else if (value === 'export') exportFile();
    };
    return {
        mount() {
            pageRuntime.addEventListener(container, 'click', onClick);
            renderPage();
            void load().catch(() => toast(t("读取 TTS 设置失败"), true));
        },
        dispose() { disposed = true; modelController?.abort(); playback.stop(); draft = null; },
    };
}
