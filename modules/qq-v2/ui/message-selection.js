import { t } from '../../i18n/index.js';
function asText(value) {
    return String(value ?? '').trim();
}

function messageIds(messages) {
    return [...new Set((Array.isArray(messages) ? messages : [])
        .map((message) => (message && typeof message === 'object' ? asText(message.messageId) : asText(message)))
        .filter(Boolean))];
}

export function createMessageSelection() {
    const byConversation = new Map();

    const getSet = (conversationId, { create = false } = {}) => {
        const id = asText(conversationId);
        if (!id) return null;
        if (!byConversation.has(id) && create) byConversation.set(id, new Set());
        return byConversation.get(id) || null;
    };
    const values = (conversationId) => [...(getSet(conversationId) || [])];

    return Object.freeze({
        get: values,
        has(conversationId, messageId) {
            return getSet(conversationId)?.has(asText(messageId)) === true;
        },
        select(conversationId, messageId) {
            const id = asText(messageId);
            const selected = getSet(conversationId, { create: true });
            if (!id || !selected) return values(conversationId);
            selected.add(id);
            return values(conversationId);
        },
        toggle(conversationId, messageId) {
            const id = asText(messageId);
            const selected = getSet(conversationId, { create: true });
            if (!id || !selected) return values(conversationId);
            if (selected.has(id)) selected.delete(id);
            else selected.add(id);
            if (selected.size === 0) byConversation.delete(asText(conversationId));
            return values(conversationId);
        },
        selectAll(conversationId, messages) {
            const id = asText(conversationId);
            const next = messageIds(messages);
            if (!id || next.length === 0) {
                if (id) byConversation.delete(id);
                return [];
            }
            byConversation.set(id, new Set(next));
            return values(id);
        },
        clear(conversationId) {
            return byConversation.delete(asText(conversationId));
        },
        clearAll() {
            byConversation.clear();
        },
    });
}

export async function deleteSelectedMessages({ facade, conversationId, selection } = {}) {
    const id = asText(conversationId);
    const messageIdsToDelete = selection?.get?.(id) || [];
    if (!id || messageIdsToDelete.length === 0) {
        return Object.freeze({ ok: false, status: 'invalid', reason: 'messages-required' });
    }
    if (typeof facade?.intent?.deleteMessages !== 'function') {
        return Object.freeze({ ok: false, status: 'unavailable', reason: 'deleteMessages-unavailable' });
    }
    const result = await facade.intent.deleteMessages({ conversationId: id, messageIds: messageIdsToDelete });
    if (result?.ok) selection.clear(id);
    return result;
}

export function selectedMessagesInjectionAction({
    conversationId,
    selection,
    messages,
    globalEnabled,
    conversationEnabled,
} = {}) {
    const selectedIds = selection?.get?.(asText(conversationId)) || [];
    const byId = new Map((Array.isArray(messages) ? messages : [])
        .filter((message) => message && typeof message === 'object')
        .map((message) => [asText(message.messageId), message]));
    const selectedMessages = selectedIds.map((messageId) => byId.get(messageId)).filter(Boolean);
    const selected = !(selectedMessages.length === selectedIds.length
        && selectedMessages.length > 0
        && selectedMessages.every((message) => message.selectedForInjection === true));
    return Object.freeze({
        messageIds: Object.freeze([...selectedIds]),
        selected,
        label: selected ? t("加入注入条目") : t("移出注入条目"),
        enabled: selectedIds.length > 0 && globalEnabled === true && conversationEnabled === true,
    });
}

export async function updateSelectedMessagesInjection({
    facade,
    conversationId,
    selection,
    messages,
    globalEnabled,
    conversationEnabled,
} = {}) {
    const id = asText(conversationId);
    const action = selectedMessagesInjectionAction({
        conversationId: id,
        selection,
        messages,
        globalEnabled,
        conversationEnabled,
    });
    if (!id || action.messageIds.length === 0) {
        return Object.freeze({ ok: false, status: 'invalid', reason: 'messages-required' });
    }
    if (!action.enabled) {
        return Object.freeze({ ok: false, status: 'unavailable', reason: 'worldbook-injection-disabled' });
    }
    if (typeof facade?.intent?.setMessagesInjection !== 'function') {
        return Object.freeze({ ok: false, status: 'unavailable', reason: 'setMessagesInjection-unavailable' });
    }
    return facade.intent.setMessagesInjection({
        conversationId: id,
        messageIds: action.messageIds,
        selected: action.selected,
    });
}

export function shouldShowUnansweredIndicator(messages, index, readMessageId) {
    const list = Array.isArray(messages) ? messages : [];
    const message = list[index];
    if (message?.senderType !== 'self' || !readMessageId || message.messageId !== readMessageId) return false;
    return !list.slice(index + 1).some((item) => item?.senderType && item.senderType !== 'system');
}
