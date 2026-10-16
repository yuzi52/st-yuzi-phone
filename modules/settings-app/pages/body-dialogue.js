import { escapeHtml as esc, escapeHtmlAttr as attr } from '../../utils/dom-escape.js';
import { buildSettingsPageFrame } from '../layout/primitives.js';
import { bindSettingsGroupedControls } from '../ui/settings-controls.js';
import { showSettingsSheet } from '../ui/settings-layer.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { pickImageFile } from '../services/media-upload/picker.js';
import { bodyDialogueService as service } from '../../body-dialogue/runtime.js';
import { bodyDialogueDefaultPrompts, BODY_DIALOGUE_NUMBERS, composeBodyDialoguePrompt, normalizeBodyDialogueLanguage } from '../../body-dialogue/config.js';
import { createDialogueView } from '../../body-dialogue/renderer.js';
import { readDialogueLibrary, copyDialogueAsset, randomDialogueAppearance } from '../../body-dialogue/resources.js';
import { bodyDialogueRepository } from '../../body-dialogue/repository.js';
import { BODY_DIALOGUE_PACK_BYTES, readBodyDialoguePeoplePack } from '../../body-dialogue/people-pack.js';
import { pickJsonPackFile } from '../../qq-v2/ui/json-pack-actions.js';
import { downloadTextFile } from '../services/media-upload/download.js';

const chevron = '<span class="phone-ios-row-chevron" aria-hidden="true">›</span>';
const switchControl = (key, checked, label, disabled = false) => `<span class="phone-ios-switch"><input type="checkbox" role="switch" data-body-setting="${key}" aria-label="${attr(label)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="phone-ios-switch-track" aria-hidden="true"></span></span>`;
const section = (label, html) => `<h2 class="phone-ios-group-header">${esc(label)}</h2><section class="phone-ios-group">${html}</section>`;
const action = (id, label, danger = false) => `<button type="button" class="phone-ios-row is-action${danger ? ' is-danger' : ''}" data-body-action="${id}">${esc(label)}</button>`;
const selects = {
    align: ['用户对白位置', { left: '靠左', right: '靠右' }],
    avatarShape: ['头像形状', { round: '圆形', rounded: '圆角方形', square: '方形' }],
    quote: ['装饰引号', { tail: '末尾 ”', pair: '两侧「」' }],
};

export function createBodyDialoguePage({ container, state, render, pageRuntime }) {
    let config = service.readConfig(), drafts = { ...config.prompts }, people = [], scope = service.getScope();
    let disposed = false, busy = false, loadVersion = 0, groupedCleanup = () => {}, previewViews = [], previewFrame = null;
    let sheet = null, personDraft = null, personCard = '', personVersion = 0;
    let cancelPackPick = () => {};
    let confirmation = null;
    const expanded = new Set();
    let hiddenSelects = '';
    const q = selector => container.querySelector(selector);
    const toast = (message, error = false) => { if (!disposed) showToast(container, message, error, pageRuntime); };
    const validPerson = token => !disposed && token === personVersion && service.getScope().card === personCard;
    const handleError = error => toast(error?.message || '操作失败，请重试', true);
    const promptEditor = (key, owner) => {
        const dirty = drafts[key] !== config.prompts[key];
        const id = `yuzi-body-prompt-${owner}`;
        const label = { name: '姓名规则 · 头像与朗读共用', base: '基础提示词', bilingual: '双语提示词', tone: '语气标记提示词',
            prosody: '语速与表现力提示词', punctuation: '标点表达提示词' }[key];
        return `<div class="yuzi-body-prompt-editor"><label class="phone-ios-field-label" for="${id}">${label}</label>
            <textarea class="phone-ios-field" id="${id}" data-body-prompt="${key}">${esc(drafts[key])}</textarea>
            <div class="yuzi-body-prompt-actions"><button type="button" class="phone-ios-mini-btn" data-body-restore="${key}">恢复默认</button>
                <span class="phone-ios-badge is-danger" data-body-dirty="${key}" ${dirty ? '' : 'hidden'}>未保存</span>
                <button type="button" class="phone-ios-mini-btn" data-body-save="${key}" ${dirty && !busy ? '' : 'disabled'}>保存</button></div></div>`;
    };
    const disclosure = (id, title, content, toggle = '') => `<div class="yuzi-body-module">
        <div class="yuzi-body-module-head"><button type="button" class="phone-ios-row is-tappable" data-body-expand="${id}" aria-expanded="${expanded.has(id)}" aria-controls="yuzi-body-panel-${id}"><span class="phone-ios-row-label">${esc(title)}</span>${chevron}</button>
        ${toggle ? switchControl(toggle, config[toggle], title) : ''}</div>
        <div class="yuzi-body-module-content" id="yuzi-body-panel-${id}" ${expanded.has(id) ? '' : 'hidden'}>${content}</div></div>`;
    const numberRow = key => {
        const [label, min, max, step, unit] = BODY_DIALOGUE_NUMBERS[key], id = `yuzi-body-${key}`;
        return `<div class="phone-ios-row"><span class="phone-ios-row-label">${label}</span>
            <div class="phone-ios-stepper" data-settings-stepper="${id}" data-settings-repeat data-step="${step}" data-unit="${unit}">
                <button type="button" class="phone-ios-stepper-btn" data-direction="-1" aria-label="减少${label}">−</button>
                <button type="button" class="phone-ios-stepper-value is-editable" data-body-number="${key}" aria-label="设置${label}">${config[key]}${unit}</button>
                <button type="button" class="phone-ios-stepper-btn" data-direction="1" aria-label="增加${label}">+</button></div>
            <input id="${id}" type="number" data-body-setting="${key}" min="${min}" max="${max}" step="${step}" value="${config[key]}" hidden></div>`;
    };
    const selectRow = key => {
        const [label, options] = selects[key], id = `yuzi-body-${key}`;
        const control = `<div class="phone-ios-row yuzi-body-segment-row"><span class="phone-ios-row-label">${label}</span><div class="phone-ios-seg" role="group" aria-label="${label}" data-settings-seg="${id}">${Object.entries(options).map(([value, text]) => `<button type="button" class="phone-ios-seg-item" data-value="${value}" aria-pressed="${config[key] === value}">${text}</button>`).join('')}</div></div>`;
        hiddenSelects += `<select id="${id}" data-body-setting="${key}" hidden>${Object.entries(options).map(([value, text]) => `<option value="${value}" ${config[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select>`;
        return control;
    };
    const colorRow = (key, label, fallback) => `<label class="phone-ios-row"><span class="phone-ios-row-label">${label}</span><input class="yuzi-body-color" type="color" data-body-setting="${key}" value="${attr(config[key] || fallback)}" aria-label="${label}"></label>`;
    function updateStatus() {
        const status = service.getStatus(), node = q('[data-body-status]');
        if (!node) return;
        node.textContent = status.message;
        node.classList.toggle('is-danger', status.state === 'error');
    }
    function updateDrafts() {
        container.querySelectorAll('[data-body-prompt]').forEach(input => { if (input.value !== drafts[input.dataset.bodyPrompt]) input.value = drafts[input.dataset.bodyPrompt]; });
        container.querySelectorAll('[data-body-dirty]').forEach(node => { node.hidden = drafts[node.dataset.bodyDirty] === config.prompts[node.dataset.bodyDirty]; });
        container.querySelectorAll('[data-body-save]').forEach(button => { button.disabled = busy || drafts[button.dataset.bodySave] === config.prompts[button.dataset.bodySave]; });
    }
    function updatePeople() {
        const panel = q('#yuzi-body-panel-people');
        if (!panel) return;
        panel.innerHTML = (people.map(person => `<button type="button" class="phone-ios-row is-tappable" data-body-person="${attr(person.id)}"><span class="yuzi-body-person-initial">${esc(Array.from(person.name)[0])}</span><span class="phone-ios-row-label">${esc(person.name)}</span>${chevron}</button>`).join('')
            || `<p class="phone-ios-row-empty">${scope.card ? '尚未创建人物' : '请先打开一张角色卡'}</p>`) + (scope.card
                ? action('new-person', '新建人物') + action('import-people', '导入人物配置') + action('export-people', '导出全部人物配置') : '');
        q('[data-body-scope]').textContent = (scope.name || '未选择角色卡') + (scope.card ? ' · 同一卡不同聊天共用' : '');
        updateInjection();
    }
    function updateInjection() {
        const preview = q('.yuzi-body-injection');
        if (preview) preview.textContent = composeBodyDialoguePrompt(config, people) || '总开关已关闭，不注入任何内容。';
    }
    function paintPreview() {
        cancelAnimationFrame(previewFrame); previewFrame = null;
        previewViews.splice(0).forEach(view => view.dispose());
        const preview = q('[data-body-preview]');
        preview.replaceChildren();
        const narration = document.createElement('p'); narration.className = 'yuzi-body-preview-narration'; narration.textContent = '傍晚，门口传来轻轻的脚步声。'; preview.append(narration);
        for (const dialogue of [{ name: '小玉', text: '你终于来了。', originalText: config.bilingual ? 'やっと来てくれたんだね。' : '' },
            { name: scope.userName || '旅人', text: '嗯，让你久等了。', originalText: config.bilingual ? 'うん、待たせちゃったね。' : '' }]) {
            const view = createDialogueView({ dialogue, config, userName: scope.userName || '旅人', onPlay: () => toast('这是样式预览，不会调用语音服务') });
            preview.append(view.node); previewViews.push(view);
        }
    }
    function updatePreview(next = config) {
        cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(() => {
            previewFrame = null;
            if (!disposed) previewViews.forEach(view => view.updateStyle(next));
        });
    }
    function updateControls() {
        container.querySelectorAll('[data-body-setting]').forEach(input => {
            const value = config[input.dataset.bodySetting];
            if (input.type === 'checkbox') input.checked = value;
            else if (input.value !== String(value)) {
                // Empty colors intentionally display the existing fallback swatch.
                if (input.type === 'color' && !value) return;
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        const originalSwitch = q('[data-body-setting="readOriginal"]');
        originalSwitch.disabled = !config.bilingual;
        originalSwitch.closest('.phone-ios-row').classList.toggle('is-disabled', !config.bilingual);
        updateInjection();
        updateDrafts(); updateStatus();
    }
    function paint() {
        if (disposed) return;
        const scrollTop = q('.phone-settings-scroll')?.scrollTop || 0;
        hiddenSelects = '';
        groupedCleanup();
        const style = `<label class="phone-ios-row"><span class="phone-ios-row-label">气泡样式</span>${switchControl('bubble', config.bubble, '气泡样式')}</label>
            ${selectRow('align')}${numberRow('nameSize')}${colorRow('nameColor', '姓名强调色', '#aa526c')}
            ${numberRow('fontSize')}${numberRow('lineHeight')}${colorRow('textColor', '对白文字色', '#253047')}
            ${numberRow('width')}${numberRow('spacing')}${numberRow('avatarSize')}${selectRow('avatarShape')}
            ${config.bubble ? colorRow('bubbleColor', '通用气泡底色', '#ffffff') + numberRow('radius') : selectRow('quote') + numberRow('quoteSize') + colorRow('quoteColor', '引号颜色', '#aa526c')}`;
        container.innerHTML = buildSettingsPageFrame({ title: '正文对话气泡', bodyClass: 'phone-app-body phone-settings-scroll phone-ios-grouped-page yuzi-body-settings', bodyHtml: `
            <section class="phone-ios-group"><label class="phone-ios-row"><span class="phone-ios-row-label">启用正文对话气泡</span>${switchControl('enabled', config.enabled, '启用正文对话气泡')}</label>${numberRow('layers')}</section>
            <p class="phone-ios-group-footer">角色卡主世界书 · D0 · 顺序 999 · 蓝灯</p>
            ${section('正文美化模块', disclosure('base', '基础格式', promptEditor('base', 'base'))
                + disclosure('avatar', '头像与姓名', promptEditor('name', 'avatar'), 'avatar')
                + disclosure('bilingual', '双语模式', promptEditor('bilingual', 'bilingual'), 'bilingual')
                + disclosure('voice', '正文朗读', promptEditor('name', 'voice')
                    + `<label class="phone-ios-row"><span class="phone-ios-row-label">语音预生成</span>${switchControl('preGenerate', config.preGenerate, '语音预生成')}</label><p class="phone-ios-group-footer">正文生成完成后，按顺序提前生成最新一楼的对白语音，仅缓存，不自动播放。</p>`
                    + `<label class="phone-ios-row${config.bilingual ? '' : ' is-disabled'}"><span class="phone-ios-row-label">朗读双语</span>${switchControl('readOriginal', config.readOriginal, '朗读双语', !config.bilingual)}</label><p class="phone-ios-group-footer">开启读上方原文，关闭读下方译文。</p>`
                    + disclosure('tone', '语气标记', promptEditor('tone', 'tone'), 'tone')
                    + disclosure('prosody', '语速与表现力', promptEditor('prosody', 'prosody'), 'prosody')
                    + disclosure('punctuation', '标点表达', promptEditor('punctuation', 'punctuation'), 'punctuation')
                    + '<p class="phone-ios-group-footer">共用设置 → TTS 的当前连接，点击对白尾部播放。</p>', 'voice'))}
            ${section('人物', disclosure('people', '人物管理', ''))}
            <p class="phone-ios-group-footer" data-body-scope></p>
            ${section('美化', '<div class="yuzi-body-preview" data-body-preview></div>' + disclosure('style', '美化参数', style))}
            ${section('实际注入内容 · 只读', '<pre class="yuzi-body-injection"></pre>')}
            <p class="phone-ios-group-footer" data-body-status role="status"></p>
            <section class="phone-ios-group">${action('sync', '重新同步世界书')}</section>${hiddenSelects}` });
        paintPreview(); updatePeople();
        groupedCleanup = bindSettingsGroupedControls(container, pageRuntime, () => !busy && !disposed);
        q('.phone-settings-scroll').scrollTop = scrollTop;
        updateStatus();
    }
    async function loadPeople() {
        const token = ++loadVersion, nextScope = service.getScope();
        const records = await service.listPeople();
        if (disposed || token !== loadVersion || nextScope.card !== service.getScope().card) return;
        scope = nextScope; people = records; updatePeople();
    }
    async function save(next, promptKey = '') {
        if (busy || disposed) return;
        const previous = config;
        busy = true; updateDrafts();
        try {
            const status = await service.saveConfig(next);
            if (disposed) return;
            config = service.readConfig();
            if (promptKey && drafts[promptKey] === next.prompts[promptKey]) drafts[promptKey] = config.prompts[promptKey];
            if (status?.state === 'error') toast(`设置已保存；${status.message}`, true);
        } catch (error) { handleError(error); }
        finally {
            config = service.readConfig(); busy = false;
            for (const key of Object.keys(drafts)) if (drafts[key] === previous.prompts[key]) drafts[key] = config.prompts[key];
            if (!disposed) {
                if (previous.bubble !== config.bubble) paint();
                else {
                    updateControls();
                    if (['avatar', 'voice', 'bilingual'].some(key => previous[key] !== config[key])) paintPreview();
                    else updatePreview();
                }
            }
        }
    }
    function closeSheet() { sheet?.close(); sheet = null; }
    function closeConfirmation() { confirmation?.close(); confirmation = null; }
    async function exportPeople() {
        const card = service.getScope().card;
        busy = true;
        try {
            const pack = await service.exportPeople(card);
            if (disposed || service.getScope().card !== card) return;
            downloadTextFile('玉子手机-正文人物配置.json', JSON.stringify(pack), 'application/json');
            toast(`已导出全部 ${pack.people.length} 位人物`);
        } catch (error) { handleError(error); }
        finally { busy = false; }
    }
    function importPeople() {
        cancelPackPick();
        personCard = service.getScope().card;
        const card = personCard, token = ++personVersion;
        cancelPackPick = pickJsonPackFile(async source => {
            if (!validPerson(token)) return;
            busy = true;
            let incoming, existing;
            try {
                incoming = await readBodyDialoguePeoplePack(source, () => validPerson(token));
                existing = await service.listPeople();
            } finally { busy = false; }
            if (!validPerson(token)) return;
            const names = new Set(existing.map(person => person.name));
            const duplicates = incoming.filter(person => names.has(person.name)).length;
            closeSheet(); closeConfirmation();
            const content = duplicates ? document.createElement('label') : null;
            if (content) {
                content.className = 'phone-ios-row';
                content.innerHTML = '<span class="phone-ios-row-label">覆盖同名人物</span><span class="phone-ios-switch"><input type="checkbox" role="switch" data-people-overwrite aria-label="覆盖同名人物"><span class="phone-ios-switch-track" aria-hidden="true"></span></span>';
            }
            const message = `将导入当前角色卡「${service.getScope().name}」的 ${incoming.length} 位人物。`
                + (duplicates ? `\n其中 ${duplicates} 位与本地同名，默认保留本地；开启覆盖将替换其整套配置，其他人物不受影响。` : '')
                + '\n音色使用你的 TTS 连接；不导入密钥，也不自动开启正文模块。';
            confirmation = showConfirmDialog(container, '导入人物配置', message, () => {
                if (busy || !validPerson(token)) return;
                busy = true;
                const overwrite = content?.querySelector('[data-people-overwrite]')?.checked === true;
                void service.importPeople(card, incoming, overwrite, () => validPerson(token)).then(async counts => {
                    if (!validPerson(token)) return;
                    await loadPeople();
                    toast(`已新增 ${counts.added} 位，覆盖 ${counts.replaced} 位，保留 ${counts.skipped} 位同名人物`);
                }).catch(handleError).finally(() => { busy = false; });
            }, '导入', '取消', pageRuntime, { content });
        }, { runtime: pageRuntime, maxBytes: BODY_DIALOGUE_PACK_BYTES,
            onError: message => { if (validPerson(token)) toast(message, true); } });
    }
    async function editPerson(person) {
        if (!service.getScope().card || busy) return;
        personCard = service.getScope().card; const token = ++personVersion;
        personDraft = person ? structuredClone(person) : { name: '', language: '', avatar: null, frame: null, bubble: null, voice: null };
        if (!person) {
            busy = true;
            try { Object.assign(personDraft, await randomDialogueAppearance()); }
            catch (error) { handleError(error); }
            finally { busy = false; }
        }
        if (validPerson(token)) showPerson();
    }
    function showPerson() {
        if (!validPerson(personVersion)) return;
        const draft = personDraft, token = personVersion;
        closeSheet();
        const urls = []; let alive = true;
        const release = () => { alive = false; urls.splice(0).forEach(url => URL.revokeObjectURL(url)); };
        const slots = [['avatar', '头像'], ['frame', '头像框'], ['bubble', '气泡'], ['voice', '音色']];
        sheet = showSettingsSheet({ title: draft.id ? '编辑人物' : '新建人物', runtime: pageRuntime, onClose: release, className: 'phone-settings-page',
            bodyHtml: `<section class="phone-ios-group"><label class="phone-ios-row is-block"><span class="phone-ios-field-label">姓名</span><input class="phone-ios-field" data-person-name value="${attr(draft.name)}" placeholder="填写正文中的姓名" autocomplete="off"></label></section>
                ${section('形象与声音', slots.map(([key, label]) => `<button type="button" class="phone-ios-row is-tappable" data-person-slot="${key}"><span class="phone-ios-row-label">${label}</span><span class="phone-ios-row-value" data-person-slot-value="${key}">${key === 'voice' ? esc(draft.voice?.name || '未设置') : draft[key] ? `<img class="phone-ios-thumb" alt="${label}" data-person-thumb="${key}">` : '未设置'}${chevron}</span></button>`).join('')
                    + `<label class="phone-ios-row"><span class="phone-ios-row-label">语言</span><input class="phone-ios-inline-input" type="text" data-person-language aria-label="语言" value="${attr(normalizeBodyDialogueLanguage(draft.language))}" placeholder="默认" autocomplete="off"></label>`)}
                <p class="phone-ios-group-footer">头像可上传并裁剪；仓库素材选取后独立保存。</p>
                <section class="phone-ios-group">${action('save-person', '保存人物')}${draft.id ? action('delete-person', '删除人物', true) : ''}</section>` });
        if (!sheet) return;
        const name = sheet.overlay.querySelector('[data-person-name]');
        sheet.bind(name, 'input', () => { draft.name = name.value; });
        const language = sheet.overlay.querySelector('[data-person-language]');
        sheet.bind(language, 'input', () => { draft.language = language.value; });
        sheet.bind(sheet.overlay, 'click', event => {
            const slot = event.target.closest('[data-person-slot]')?.dataset.personSlot;
            if (slot) { void selectAsset(slot).catch(handleError); return; }
            const actionId = event.target.closest('[data-body-action]')?.dataset.bodyAction;
            if (actionId === 'save-person') {
                if (busy) return;
                busy = true;
                void service.savePerson(personCard, draft).then(async () => {
                    if (validPerson(token)) { closeSheet(); await loadPeople(); toast('人物已保存'); }
                }).catch(handleError).finally(() => { busy = false; });
            }
            if (actionId === 'delete-person') {
                if (busy || !validPerson(token)) return;
                closeSheet(); closeConfirmation();
                confirmation = showConfirmDialog(container, '删除人物', `删除“${draft.name}”的正文人物资料？不会删除 QQ 仓库的原素材。`, () => {
                    if (busy || !validPerson(token)) return;
                    busy = true;
                    void service.deletePerson(personCard, draft.id).then(async () => { if (validPerson(token)) await loadPeople(); })
                        .catch(error => { if (validPerson(token)) showPerson(); handleError(error); }).finally(() => { busy = false; });
                }, '删除', '取消', pageRuntime, { onCancel: () => { if (validPerson(token)) showPerson(); } });
            }
        });
        for (const [slot] of slots.filter(([key]) => key !== 'voice')) {
            const asset = draft[slot], image = sheet.overlay.querySelector(`[data-person-thumb="${slot}"]`);
            if (!asset || !image) continue;
            void (asset.blob ? Promise.resolve(asset) : bodyDialogueRepository.getMedia(asset.mediaId)).then(media => {
                if (!alive || !validPerson(token) || !image.isConnected || !media?.blob) return;
                const url = URL.createObjectURL(media.blob); urls.push(url); image.src = url;
            }).catch(handleError);
        }
    }
    async function selectAsset(slot) {
        const token = personVersion, library = await readDialogueLibrary();
        if (!validPerson(token)) return;
        closeSheet();
        if (slot === 'voice') {
            const entries = [null, ...library.voices];
            sheet = showSettingsSheet({ title: '音色仓库', runtime: pageRuntime, doneText: '返回', onDone: () => { showPerson(); return false; },
                bodyHtml: `<section class="phone-ios-group" role="listbox" aria-label="音色仓库">${entries.map((entry, index) => `<button type="button" class="phone-ios-row phone-ios-option" role="option" aria-selected="${(entry?.voiceId || '') === (personDraft.voice?.voiceId || '')}" data-body-voice-index="${index}"><span class="phone-ios-row-label">${esc(entry?.name || '未设置')}</span><span class="phone-ios-option-check" aria-hidden="true">✓</span></button>`).join('')}</section>` });
            if (sheet) sheet.bind(sheet.overlay, 'click', event => {
                const button = event.target.closest('[data-body-voice-index]');
                if (!button || !validPerson(token)) return;
                const selected = entries[Number(button.dataset.bodyVoiceIndex)];
                personDraft.voice = selected ? { name: selected.name, voiceId: selected.voiceId } : null; showPerson();
            });
            return;
        }
        const kind = { avatar: 'avatar', frame: 'avatar-frame', bubble: 'bubble' }[slot];
        const assets = library.assets.filter(asset => asset.library === kind);
        const urls = []; let alive = true, active = 0; const pending = []; let observer;
        const release = () => { alive = false; observer?.disconnect(); urls.splice(0).forEach(url => URL.revokeObjectURL(url)); };
        sheet = showSettingsSheet({ title: '图片资料', runtime: pageRuntime, onClose: release, doneText: '返回', onDone: () => { showPerson(); return false; },
            bodyHtml: `<section class="phone-ios-group">${action('unset', '不使用此素材')}${slot === 'avatar' ? action('upload', '上传头像并裁剪') : ''}</section>
                <section class="phone-ios-group"><div class="phone-ios-icon-grid yuzi-body-library">${assets.map((_asset, index) => `<button type="button" class="phone-ios-icon-cell" data-body-asset-index="${index}" aria-label="选择素材 ${index + 1}"><img class="phone-ios-thumb" alt="素材 ${index + 1}"></button>`).join('')}</div>${assets.length ? '' : '<p class="phone-ios-row-empty">仓库暂无素材</p>'}</section>` });
        if (!sheet) return;
        const run = () => {
            while (alive && active < 4 && pending.length) {
                const button = pending.shift(); active++;
                void copyDialogueAsset(assets[Number(button.dataset.bodyAssetIndex)]).then(asset => {
                    if (!alive || !button.isConnected) return;
                    const url = URL.createObjectURL(asset.blob); urls.push(url); button.querySelector('img').src = url;
                }).catch(() => {}).finally(() => { active--; run(); });
            }
        };
        const buttons = [...sheet.overlay.querySelectorAll('[data-body-asset-index]')];
        observer = new IntersectionObserver(entries => {
            for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); pending.push(entry.target); }
            run();
        }, { root: sheet.overlay.querySelector('.phone-ios-sheet-body'), rootMargin: '100px' });
        buttons.forEach(button => observer.observe(button));
        sheet.bind(sheet.overlay, 'click', event => {
            const button = event.target.closest('button'); if (!button || busy) return;
            const index = button.dataset.bodyAssetIndex, actionId = button.dataset.bodyAction;
            if (index !== undefined) {
                busy = true;
                void copyDialogueAsset(assets[Number(index)]).then(asset => { if (alive && validPerson(token)) { personDraft[slot] = asset; showPerson(); } }).catch(handleError).finally(() => { busy = false; });
            }
            if (actionId === 'unset') { personDraft[slot] = null; showPerson(); }
            if (actionId === 'upload') {
                closeSheet();
                pickImageFile(async dataUrl => {
                    const blob = await (await fetch(dataUrl)).blob();
                    if (validPerson(token)) { personDraft.avatar = { blob }; showPerson(); }
                }, { runtime: pageRuntime, cropPreset: 'toggle-cover-circle', cropTitle: '裁剪头像', onCancel: () => showPerson(), onError: message => { toast(message, true); showPerson(); } });
            }
        });
    }
    const click = event => {
        const button = event.target.closest('button'); if (!button || !container.contains(button)) return;
        if (button.classList.contains('phone-nav-back')) { state.mode = 'home'; render(); return; }
        if (button.dataset.bodyExpand) {
            const key = button.dataset.bodyExpand; if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
            button.setAttribute('aria-expanded', String(expanded.has(key))); q(`#yuzi-body-panel-${key}`).hidden = !expanded.has(key); return;
        }
        if (button.dataset.bodyRestore) { drafts[button.dataset.bodyRestore] = bodyDialogueDefaultPrompts(config)[button.dataset.bodyRestore]; updateDrafts(); return; }
        if (button.dataset.bodySave) { const key = button.dataset.bodySave; void save({ ...config, prompts: { ...config.prompts, [key]: drafts[key] } }, key); return; }
        if (busy) return;
        if (button.dataset.bodyNumber) {
            const key = button.dataset.bodyNumber, [title, min, max, step] = BODY_DIALOGUE_NUMBERS[key];
            sheet = showSettingsSheet({ title, runtime: pageRuntime, className: 'phone-settings-page', doneText: '保存', bodyHtml: `<section class="phone-ios-group"><label class="phone-ios-row is-block"><span class="phone-ios-field-label">${title}</span><input class="phone-ios-field" type="number" min="${min}" max="${max}" step="${step}" value="${config[key]}" required></label></section>`,
                onDone: overlay => { const input = overlay.querySelector('input'); if (!input.reportValidity()) return false; void save({ ...config, [key]: Number(input.value) }); } });
        }
        if (button.dataset.bodyPerson) void editPerson(people.find(person => person.id === button.dataset.bodyPerson)).catch(handleError);
        if (button.dataset.bodyAction === 'new-person') void editPerson(null).catch(handleError);
        if (button.dataset.bodyAction === 'import-people') importPeople();
        if (button.dataset.bodyAction === 'export-people') void exportPeople();
        if (button.dataset.bodyAction === 'sync') void service.sync().then(updateStatus).catch(handleError);
    };
    return {
        mount() {
            paint(); void loadPeople().catch(handleError);
            pageRuntime.addEventListener(container, 'click', click);
            pageRuntime.addEventListener(container, 'input', event => {
                const key = event.target.dataset.bodyPrompt;
                if (key) { drafts[key] = event.target.value; updateDrafts(); }
                const setting = event.target.dataset.bodySetting;
                if (setting && event.target.type === 'number') updatePreview({ ...config, [setting]: Number(event.target.value) });
            });
            pageRuntime.addEventListener(container, 'change', event => {
                const key = event.target.dataset.bodySetting;
                if (key) {
                    if (busy) { updateControls(); return; }
                    void save({ ...config, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.type === 'number' ? Number(event.target.value) : event.target.value });
                }
            });
            pageRuntime.registerCleanup(service.subscribe(() => {
                if (disposed) return;
                const current = service.getScope();
                if (current.card !== scope.card) {
                    personVersion++; cancelPackPick(); closeSheet(); closeConfirmation(); scope = current; people = []; updatePeople(); paintPreview();
                    void loadPeople().catch(handleError);
                } else if (current.userName !== scope.userName) { scope = current; paintPreview(); }
                updateStatus();
            }));
        },
        dispose() { groupedCleanup(); disposed = true; personVersion++; cancelPackPick(); closeSheet(); closeConfirmation(); cancelAnimationFrame(previewFrame); previewViews.splice(0).forEach(view => view.dispose()); },
    };
}
