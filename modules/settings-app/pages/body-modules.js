import { escapeHtml as esc, escapeHtmlAttr as attr } from '../../utils/dom-escape.js';
import { bodyDialogueService as service } from '../../body-dialogue/runtime.js';
import { BODY_MODULE_BYTES, BODY_TIME_ID } from '../../body-dialogue/beautify-modules.js';
import { pickJsonPackFile } from '../../qq-v2/ui/json-pack-actions.js';
import { downloadTextFile } from '../services/media-upload/download.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';

/** The host builds the settings controls; author code only runs in enabled prose views. */
export function createBodyModuleSettings({ container, pageRuntime, onChange }) {
    let root = null, events = null, disposed = false, busy = false, confirmation = null, cancelPick = () => {};
    let entries = service.getModules();
    const drafts = new Map(), expanded = new Set();
    const key = (id, control = '') => `${id}:${control}`;
    const findPrompt = (entry, control) => control ? entry.controls.find(item => item.id === control)?.prompt : entry.prompt;
    const error = value => { if (!disposed) showToast(container, value?.message || String(value), true, pageRuntime); };
    const toast = value => { if (!disposed) showToast(container, value, false, pageRuntime); };
    const switchHtml = (entry, control) => `<span class="phone-ios-switch"><input type="checkbox" role="switch" data-module-toggle="${attr(entry.id)}" data-module-control="${attr(control?.id || '')}" aria-label="${attr(control?.label || entry.name)}" ${(control ? control.value : entry.enabled) ? 'checked' : ''}><span class="phone-ios-switch-track" aria-hidden="true"></span></span>`;
    const editor = (entry, control = '') => {
        const prompt = findPrompt(entry, control), draftKey = key(entry.id, control);
        if (!drafts.has(draftKey)) drafts.set(draftKey, prompt.value);
        const id = `yuzi-body-module-prompt-${entry.id}-${control ? `control-${control}` : 'main'}`;
        return `<div class="yuzi-body-prompt-editor" data-module-editor="${attr(entry.id)}" data-module-control="${attr(control)}">
            <label class="phone-ios-field-label" for="${attr(id)}">${control ? '附加提示词' : '模块提示词'}</label>
            <textarea class="phone-ios-field" id="${attr(id)}" data-module-prompt="${attr(entry.id)}" data-module-control="${attr(control)}">${esc(drafts.get(draftKey))}</textarea>
            <div class="yuzi-body-prompt-actions"><button type="button" class="phone-ios-mini-btn" data-module-restore>恢复默认</button>
            <span class="phone-ios-badge is-danger" data-module-dirty hidden>未保存</span><button type="button" class="phone-ios-mini-btn" data-module-save>保存</button></div></div>`;
    };
    const disclosure = (id, label, toggle, content, footer = '') => `<div class="yuzi-body-module"><div class="yuzi-body-module-head">
        <button type="button" class="phone-ios-row is-tappable" data-module-expand="${attr(id)}" aria-expanded="${expanded.has(id)}" aria-controls="yuzi-body-module-panel-${attr(id)}"><span class="phone-ios-row-label">${esc(label)}</span><span class="phone-ios-row-chevron" aria-hidden="true">›</span></button>${toggle}</div>
        <div class="yuzi-body-module-content" id="yuzi-body-module-panel-${attr(id)}" ${expanded.has(id) ? '' : 'hidden'}>${content}</div>${footer}</div>`;
    function render() {
        if (!root || disposed) return;
        const scroll = root.closest('.phone-settings-scroll'), top = scroll?.scrollTop;
        root.innerHTML = entries.map(entry => disclosure(entry.id, entry.name, switchHtml(entry),
            (entry.description ? `<p class="phone-ios-group-footer">${esc(entry.description)}</p>` : '') + editor(entry)
            + entry.controls.map(control => {
                const description = control.description ? `<p class="phone-ios-group-footer">${esc(control.description)}</p>` : '';
                return control.prompt
                    ? disclosure(`${entry.id}--${control.id}`, control.label, switchHtml(entry, control), description + editor(entry, control.id))
                    : `<label class="phone-ios-row"><span class="phone-ios-row-label">${esc(control.label)}</span>${switchHtml(entry, control)}</label>${description}`;
            }).join('')
            + (entry.id === BODY_TIME_ID ? '' : `<button type="button" class="phone-ios-row is-action is-danger" data-module-delete="${attr(entry.id)}">删除模块</button>`),
            `<p class="phone-ios-group-footer is-danger" data-module-error="${attr(entry.id)}" role="status" hidden></p>`)).join('')
            + '<p class="phone-ios-group-footer is-danger" data-module-error="library" role="status" hidden></p>'
            + '<button type="button" class="phone-ios-row is-action" data-module-import>导入模块</button><button type="button" class="phone-ios-row is-action" data-module-export>导出模块</button>';
        update();
        if (scroll) scroll.scrollTop = top;
    }
    function updateErrors() {
        if (!root || disposed) return;
        const errors = service.getModuleErrors();
        root.querySelectorAll('[data-module-error]').forEach(node => {
            node.textContent = (errors[node.dataset.moduleError] || '').slice(0, 180); node.hidden = !node.textContent;
        });
    }
    function updateEditor(node) {
        const id = node.dataset.moduleEditor, control = node.dataset.moduleControl;
        const entry = entries.find(item => item.id === id), draft = drafts.get(key(id, control));
        const dirty = draft !== findPrompt(entry, control).value;
        const input = node.querySelector('textarea'); if (input.value !== draft) input.value = draft;
        node.querySelector('[data-module-dirty]').hidden = !dirty;
        node.querySelector('[data-module-save]').disabled = busy || !dirty;
        node.querySelector('[data-module-restore]').disabled = busy;
    }
    function update() {
        if (!root || disposed) return;
        updateErrors();
        root.querySelectorAll('[data-module-toggle]').forEach(input => {
            const entry = entries.find(item => item.id === input.dataset.moduleToggle);
            const control = input.dataset.moduleControl;
            input.checked = control ? entry.controls.find(item => item.id === control).value : entry.enabled;
            input.disabled = busy;
        });
        root.querySelectorAll('[data-module-editor]').forEach(updateEditor);
        root.querySelectorAll('[data-module-import], [data-module-export], [data-module-delete]').forEach(button => { button.disabled = busy; });
    }
    function sync() {
        const next = service.getModules(), changed = next.map(entry => entry.id).join('|') !== entries.map(entry => entry.id).join('|');
        const liveDrafts = new Set(), liveExpanded = new Set();
        for (const entry of next) {
            liveExpanded.add(entry.id);
            entry.controls.filter(item => item.prompt).forEach(control => liveExpanded.add(`${entry.id}--${control.id}`));
            const previous = entries.find(item => item.id === entry.id);
            for (const control of ['', ...entry.controls.filter(item => item.prompt).map(item => item.id)]) {
                const draftKey = key(entry.id, control);
                liveDrafts.add(draftKey);
                if (!drafts.has(draftKey) || drafts.get(draftKey) === (previous && findPrompt(previous, control)?.value)) drafts.set(draftKey, findPrompt(entry, control).value);
            }
        }
        for (const draftKey of drafts.keys()) if (!liveDrafts.has(draftKey)) drafts.delete(draftKey);
        for (const id of expanded) if (!liveExpanded.has(id)) expanded.delete(id);
        entries = next;
        if (changed) render(); else update();
        onChange();
    }
    async function run(operation) {
        if (busy || disposed) return;
        busy = true; update();
        try { await operation(); }
        catch (failure) { error(failure); }
        finally { busy = false; if (!disposed) update(); }
    }
    function click(event) {
        const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
        const expandId = button.dataset.moduleExpand;
        if (expandId) {
            if (expanded.has(expandId)) expanded.delete(expandId); else expanded.add(expandId);
            button.setAttribute('aria-expanded', String(expanded.has(expandId)));
            root.querySelector(`#yuzi-body-module-panel-${CSS.escape(expandId)}`).hidden = !expanded.has(expandId); return;
        }
        if (busy) return;
        const promptNode = button.closest('[data-module-editor]');
        if (promptNode) {
            const id = promptNode.dataset.moduleEditor, controlId = promptNode.dataset.moduleControl;
            const entry = entries.find(item => item.id === id);
            if (button.hasAttribute('data-module-restore')) { drafts.set(key(id, controlId), findPrompt(entry, controlId).default); updateEditor(promptNode); }
            if (button.hasAttribute('data-module-save')) void run(() => service.saveModule(id, controlId
                ? { controlId, controlPrompt: drafts.get(key(id, controlId)) } : { prompt: drafts.get(key(id)) }));
        }
        if (button.hasAttribute('data-module-import')) {
            cancelPick();
            cancelPick = pickJsonPackFile(source => run(async () => {
                const count = await service.importModules(source); toast(`已新增 ${count} 个模块，默认关闭`);
            }), { runtime: pageRuntime, maxBytes: BODY_MODULE_BYTES, onError: error });
        }
        if (button.hasAttribute('data-module-export')) void run(async () => {
            const pack = await service.exportModules();
            if (disposed) return;
            downloadTextFile('玉子手机-正文美化模块.json', JSON.stringify(pack, null, 2), 'application/json');
            toast(`已导出全部 ${pack.modules.length} 个模块`);
        });
        if (button.dataset.moduleDelete) {
            const id = button.dataset.moduleDelete, entry = entries.find(item => item.id === id);
            confirmation?.close();
            confirmation = showConfirmDialog(container, '删除模块', `删除「${entry.name}」？对应正文将恢复原文，同名的其他模块不受影响。`,
                () => { void run(() => service.deleteModule(id)); }, '删除', '取消', pageRuntime);
        }
    }
    const unsubscribe = service.subscribe(reason => {
        if (disposed) return;
        if (reason === 'modules') sync();
        else if (reason === 'module-errors') updateErrors();
    });
    void service.loadModules().catch(error);
    return {
        mount(element) {
            events?.abort(); root = element; events = new AbortController(); render();
            root.addEventListener('click', click, { signal: events.signal });
            root.addEventListener('input', event => {
                if (event.target.dataset.modulePrompt) {
                    drafts.set(key(event.target.dataset.modulePrompt, event.target.dataset.moduleControl), event.target.value);
                    updateEditor(event.target.closest('[data-module-editor]'));
                }
            }, { signal: events.signal });
            root.addEventListener('change', event => {
                const id = event.target.dataset.moduleToggle, controlId = event.target.dataset.moduleControl;
                if (!id) return;
                if (busy) { update(); return; }
                const checked = event.target.checked;
                void run(() => service.saveModule(id, controlId ? { controlId, controlValue: checked } : { enabled: checked }));
            }, { signal: events.signal });
        },
        dispose() { disposed = true; events?.abort(); unsubscribe(); cancelPick(); confirmation?.close(); drafts.clear(); expanded.clear(); root = null; },
    };
}
