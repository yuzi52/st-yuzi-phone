import { qqV2MessageType } from '../domain/message-semantics.js';

const text = value => String(value ?? '');
const encode = value => text(value).replaceAll('\\', '\\\\').replace(/\r\n?|\n/gu, '\\n');
const visible = message => message && !message.deleted && !message.isDeleted;

/** Names stay readable; reserved/structural names use an already provided request reference. */
export function qqHistoryLabel(name, reference = '') {
    return reference && (/[|｜\r\n]/u.test(name) || /^(?:user|all|system|[NPG]\d+)$/u.test(name)) ? reference : text(name);
}

export function createQQMessageReferences(messages = [], conversationReference = '') {
    return Object.fromEntries(messages.filter(visible).flatMap((message, index) => message.messageId
        ? [[`${conversationReference ? `${conversationReference}-` : ''}M${index + 1}`, message.messageId]] : []));
}

/** The same typed history is used for role messages, proactive sections, and read-only memories. */
export function formatQQHistory(messages = [], options = {}) {
    const items = messages.filter(visible);
    const references = options.numbered ? createQQMessageReferences(items, options.referenceId) : {};
    const referenceById = new Map(Object.entries(references).map(([ref, id]) => [id, ref]));
    const people = options.peopleById || {};
    const referenceByPersonId = options.referenceByPersonId || new Map();
    const personName = (id, fallback = '') => {
        if (id === '__self__') return 'user';
        if (id === '__system__') return 'system';
        const person = people instanceof Map ? people.get(id) : people[id];
        const name = (typeof person === 'string' ? person : person?.formalName || person?.name)
            || (id === options.personId ? options.personName || options.title : '');
        const reference = referenceByPersonId.get(id) || (id === options.personId ? options.referenceId : '');
        return qqHistoryLabel(name || fallback || '未知成员', reference);
    };
    return items.map((message, index) => {
        const type = qqV2MessageType(message);
        const sender = message.senderType === 'system' || type === 'system' ? 'system'
            : message.senderType === 'self' || message.sender === 'self' ? 'user'
                : personName(message.senderId || options.personId, message.senderName || options.personName || options.title);
        const parts = [];
        if (options.numbered) parts.push(`[${options.referenceId ? `${options.referenceId}-` : ''}M${index + 1}]`);
        if (options.kind === 'group') {
            if (message.quoteMessageId) {
                const quote = referenceById.get(message.quoteMessageId) || (message.quote?.status === 'deleted' ? 'deleted' : 'outside');
                parts.push(`[quote|${quote}]`);
            }
            if (message.mentionAll) parts.push('[at|all]');
            else if (message.mentionIds?.length) parts.push(`[at|${message.mentionIds.map(id => encode(personName(id))).join('|')}]`);
        }
        if (type === 'transfer') {
            const transfer = message.transfer || {};
            const amount = [transfer.amount, transfer.currency].filter(Boolean).join(' ');
            parts.push(`[transfer|${encode(sender)}|${encode(personName(transfer.recipientId))}|${encode(amount)}|${encode(transfer.status || 'pending')}|${encode(transfer.note)}]`);
        } else {
            // Sticker descriptions are snapshots, never stale S references or media addresses.
            parts.push(`[${type}|${encode(sender)}|${encode(message.content ?? message.text ?? message.body)}]`);
        }
        return parts.join('');
    });
}

export function formatQQHistorySection(section, { kind, numbered = false, referenceId = '' } = {}) {
    const name = section.title || section.name || section.personName || '';
    const lines = [`[${kind}|${encode(qqHistoryLabel(name, referenceId))}]`];
    const knownBy = Array.isArray(section.knownBy) ? section.knownBy : text(section.knownBy).split(',').filter(Boolean);
    if (kind === 'group' && knownBy.length) {
        lines.push(`[known-by|${knownBy.map(encode).join('|')}]`);
    }
    lines.push(...formatQQHistory(section.messages || [], { ...section, kind, numbered, referenceId }));
    return lines.join('\n');
}
