import { t } from '../../i18n/index.js';

// 只拥有人物选择与人设编辑；会话列表、消息、媒体和请求仍由 QQ App 拥有。
export function createAssistantUI({ facade, createElement: el, createButton: button, createDialogAvatars,
    showDialog, clearOverlay, openChat, render, makeSecondaryPage, profileEditor, isCurrent, report }) {
    const drafts = new Map();
    const check = result => {
        if (!result?.ok) throw new Error(result?.error?.message || t("操作失败，请重试"));
        return result;
    };
    const save = async (characterId, patch) => check(await facade.intent.saveAssistantCharacter({ characterId, patch }));
    const open = async input => {
        const result = check(await facade.intent.openAssistant(input));
        if (!isCurrent()) return;
        clearOverlay();
        await openChat(result.result.conversation);
    };
    const confirm = (title, text, action) => {
        const content = el('p'); content.textContent = text;
        const cancel = button(t("取消"), 'yuzi-qq-secondary-button'); cancel.addEventListener('click', clearOverlay);
        const accept = button(t("确认"), 'yuzi-qq-danger-button');
        accept.addEventListener('click', async () => {
            accept.disabled = true;
            try { await action(); } catch (error) { accept.disabled = false; report(error); }
        });
        content.className = 'yuzi-qq-confirm-copy';
        showDialog({ title, content, actions: [cancel, accept] });
    };
    const createCharacter = () => {
        const content = el('div', 'yuzi-qq-dialog-form');
        const name = el('input', 'yuzi-qq-add-contact-name-input');
        name.placeholder = t("人物姓名"); name.maxLength = 120; name.setAttribute('aria-label', t("人物姓名"));
        const error = el('p', 'yuzi-qq-form-error');
        const cancel = button(t("取消"), 'yuzi-qq-secondary-button'); cancel.addEventListener('click', clearOverlay);
        const accept = button(t("创建人物"), 'yuzi-qq-primary-button'); accept.disabled = true;
        name.addEventListener('input', () => { accept.disabled = !name.value.trim(); });
        accept.addEventListener('click', async () => {
            accept.disabled = true;
            try { await open({ name: name.value }); }
            catch (failure) { error.textContent = failure.message; accept.disabled = false; }
        });
        name.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing && !accept.disabled) { event.preventDefault(); accept.click(); }
        });
        content.append(name, error);
        showDialog({ title: t("新建人物"), content, actions: [cancel, accept] }); name.focus();
    };
    const choose = async () => {
        try {
            const { characters } = check(await facade.query.assistantCharacters());
            if (!isCurrent()) return;
            const portraits = createDialogAvatars();
            const content = el('div', 'phone-ios-group yuzi-qq-assistant-characters');
            for (const character of characters) {
                const row = el('div', 'phone-ios-row yuzi-qq-assistant-character-row');
                const select = button('', 'yuzi-qq-person-picker-choice');
                const label = el('span', 'yuzi-qq-person-picker-name'); label.textContent = character.formalName;
                select.append(portraits.render(character), label);
                select.addEventListener('click', async () => {
                    select.disabled = true;
                    try { await open({ characterId: character.characterId }); }
                    catch (error) { select.disabled = false; report(error); }
                });
                row.append(select);
                if (!character.isBuiltIn) {
                    const remove = button('×', 'yuzi-qq-icon-button', { 'aria-label': t`删除人物${character.formalName}` });
                    remove.addEventListener('click', () => confirm(t("删除人物"), t`删除“${character.formalName}”及其在所有酒馆聊天中的陪聊记录？此操作不可撤销。`, async () => {
                        check(await facade.intent.deleteAssistantCharacter({ characterId: character.characterId }));
                        drafts.delete(character.characterId); clearOverlay(); await render();
                    }));
                    row.append(remove);
                }
                content.append(row);
            }
            const add = button(t("新建人物"), 'yuzi-qq-primary-button'); add.addEventListener('click', createCharacter);
            const close = button(t("取消"), 'yuzi-qq-secondary-button'); close.addEventListener('click', clearOverlay);
            showDialog({ title: t("选择陪聊人物"), content, actions: [close, add], className: 'yuzi-qq-person-picker-dialog', onClose: portraits.dispose });
        } catch (error) { report(error); }
    };
    const settings = async (conversation, token) => {
        const { main, content } = makeSecondaryPage(t("陪聊设置"), {
            className: 'phone-ios-grouped-page yuzi-qq-profile-editor-view yuzi-qq-conversation-settings-view yuzi-qq-assistant-settings-view',
        });
        const { characters } = check(await facade.query.assistantCharacters());
        if (!isCurrent(token)) return main;
        const character = characters.find(item => item.characterId === conversation.assistantCharacterId);
        if (!character) return main;
        const id = character.characterId;
        let draft = drafts.get(id);
        if (!draft || draft.value === draft.saved) {
            draft = { saved: character.persona, value: character.persona }; drafts.set(id, draft);
        }
        const groups = el('div', 'yuzi-qq-profile-editor-list');
        const status = el('p', 'yuzi-qq-settings-status yuzi-qq-profile-editor-status');
        status.dataset.qqProfileEditorStatus = 'assistant';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const owner = { owner: 'assistant', characterId: id, token };
        const assetRow = field => profileEditor.assetRow({
            ...owner, field, value: character[field] || '', avatarUrl: character.avatarUrl,
        });
        profileEditor.addGroup(groups, t("人物"), [
            profileEditor.fieldRow({ ...owner, field: 'formalName', label: t("姓名"), value: character.formalName }),
            assetRow('avatarAssetId'),
        ]);
        profileEditor.addGroup(groups, t("形象"), [
            profileEditor.assetRow({
                field: 'backgroundAssetId', value: conversation.backgroundAssetId || '',
                owner: 'private', conversationId: conversation.conversationId, token,
            }),
            assetRow('avatarFrameAssetId'),
            assetRow('bubbleAssetId'),
            profileEditor.messageColorRow({ ...owner, value: character.messageTextColor || 'black' }),
            profileEditor.voiceRow({ ...owner, value: character.voiceId }),
        ]);
        const footer = el('p', 'phone-ios-group-footer');
        footer.textContent = t("背景、头像框、气泡选好后立即生效；头像框与气泡素材来自图片资料。");
        groups.append(footer);
        const persona = el('div', 'phone-ios-row is-block yuzi-qq-assistant-persona');
        const head = el('div', 'yuzi-qq-assistant-persona-head');
        const label = el('label', 'phone-ios-field-label'); label.textContent = t("人物人设");
        const dirty = el('span', 'phone-ios-badge is-danger'); dirty.textContent = t("未保存");
        const textarea = el('textarea', 'phone-ios-field');
        textarea.id = 'yuzi-qq-assistant-persona'; label.htmlFor = textarea.id;
        textarea.value = draft.value; textarea.rows = 12;
        textarea.placeholder = t("在这里自由填写人物身份、性格、说话方式与语料");
        const syncDirty = () => { dirty.hidden = draft.value === draft.saved; };
        textarea.addEventListener('input', () => { draft.value = textarea.value; syncDirty(); });
        head.append(label, dirty); persona.append(head, textarea);
        profileEditor.addGroup(groups, t("人设"), [persona]);
        const submit = button(t("保存人设"), 'phone-ios-row is-action');
        submit.addEventListener('click', async () => {
            const value = textarea.value; submit.disabled = true;
            try { await save(id, { persona: value }); draft.saved = value; syncDirty(); status.textContent = t("人设已保存"); }
            catch (error) { status.textContent = error.message; }
            finally { submit.disabled = false; }
        });
        const actions = [submit];
        if (character.isBuiltIn) {
            const reset = button(t("恢复默认人设"), 'phone-ios-row is-action');
            reset.addEventListener('click', () => {
                textarea.value = character.defaultPersona; draft.value = textarea.value; syncDirty();
                status.textContent = t("已填回默认人设，点击保存后生效");
            });
            actions.push(reset);
        }
        profileEditor.addGroup(groups, '', actions).classList.add('yuzi-qq-assistant-actions');
        syncDirty();
        content.append(groups, status);
        profileEditor.bindControls(groups, token);
        return main;
    };
    return {
        choose, settings,
        leave(characterId, action) {
            const draft = drafts.get(characterId);
            if (!draft || draft.value === draft.saved) return action();
            confirm(t("放弃未保存的人设？"), t("人设修改尚未保存，是否放弃并返回？"), () => {
                drafts.delete(characterId); clearOverlay(); return action();
            });
        },
    };
}
