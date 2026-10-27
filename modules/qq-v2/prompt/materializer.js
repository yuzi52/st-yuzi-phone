import { formatQQHistorySection } from './history.js';
import { filterQQV2StoryContent } from '../domain/story-context-tags.js';
import {
    QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS,
    QQ_V2_PROMPT_PLACEHOLDERS,
} from './placeholders.js';

const BUILT_IN_PLACEHOLDER_ENTRIES = Object.freeze(Object.entries(Object.fromEntries(
    QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.map(({ token, variable }) => [token, variable]),
)));

function asText(value) {
    return String(value ?? '');
}

function materializedValue(value) {
    const text = asText(value).trim();
    return text || '无';
}

function asMessageBlocks(presetOrBlocks) {
    if (Array.isArray(presetOrBlocks)) return presetOrBlocks;
    if (Array.isArray(presetOrBlocks?.blocks)) return presetOrBlocks.blocks;
    if (Array.isArray(presetOrBlocks?.messages)) return presetOrBlocks.messages;
    return [];
}

function messageRole(message) {
    if (message?.role === 'user' || message?.role === 'assistant' || message?.role === 'system') {
        return message.role;
    }
    if (message?.senderType === 'self' || message?.sender === 'self') return 'user';
    if (message?.senderType === 'system' || message?.sender === 'system') return 'system';
    return 'assistant';
}

function isVisibleMessage(message) {
    return Boolean(message) && message.deleted !== true && message.isDeleted !== true;
}

function historyMessage(message) {
    return Object.freeze({
        role: messageRole(message),
        content: asText(message?.content ?? message?.text ?? message?.body),
    });
}

function sameMessage(left, right) {
    const leftId = asText(left?.id ?? left?.messageId);
    const rightId = asText(right?.id ?? right?.messageId);
    if (leftId && rightId) return leftId === rightId;
    return messageRole(left) === messageRole(right)
        && historyMessage(left).content === historyMessage(right).content;
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
}

function isSuccessfulStoryReply(message) {
    return message?.role === 'assistant'
        && message?.isSystem !== true
        && message?.is_system !== true
        && message?.isHidden !== true
        && message?.is_hidden !== true
        && message?.isSuccessful !== false
        && message?.is_successful !== false;
}

/**
 * 将用户可编辑的消息块原样保留角色和顺序，仅替换 QQ 已声明的占位符。
 */
export function materializeQQV2PromptBlocks(blocks, variables = {}) {
    return Object.freeze(asMessageBlocks(blocks).map((block) => {
        let content = asText(block?.content);
        for (const [placeholder, key] of BUILT_IN_PLACEHOLDER_ENTRIES) {
            content = content.replaceAll(placeholder, materializedValue(variables[key]));
        }
        return Object.freeze({
            role: messageRole(block),
            content,
        });
    }));
}

/**
 * 手动回复的角色历史只来自当前 QQ 会话，并作为真实角色消息追加一次。
 */
export function buildManualQQV2Request({ preset, variables = {}, history = [], currentMessage } = {}) {
    const request = Array.from(materializeQQV2PromptBlocks(preset, variables), (message) => message ?? Object.freeze({}));
    const visibleHistory = Array.isArray(history) ? history.filter(isVisibleMessage) : [];
    request.push(...visibleHistory.map(historyMessage));

    if (currentMessage && !visibleHistory.some((message) => sameMessage(message, currentMessage))) {
        request.push(historyMessage(currentMessage));
    }
    return Object.freeze(request);
}

/**
 * 主动请求不附加 OpenAI 角色历史；会话资料只能经用户放入的分区占位符进入预设块。
 */
export function buildProactiveQQV2Request({ preset, variables = {} } = {}) {
    return materializeQQV2PromptBlocks(preset, variables);
}

/**
 * 读取最近 N 条成功完成的正文 AI 回复。0 表示全部正文 AI 回复；用户消息不进入。
 */
export function buildQQV2StoryContext(messages, turns = 0, tagSettings = {}) {
    const history = Array.isArray(messages) ? messages : [];
    const limit = positiveInteger(turns);
    let selectedReplies;
    if (limit) {
        selectedReplies = [];
        for (let index = history.length - 1; index >= 0 && selectedReplies.length < limit; index -= 1) {
            const message = history[index];
            if (isSuccessfulStoryReply(message)) selectedReplies.push(message);
        }
        selectedReplies.reverse();
    } else {
        selectedReplies = history.filter(isSuccessfulStoryReply);
    }
    const text = selectedReplies
        .map((message) => filterQQV2StoryContent(message?.content, tagSettings))
        .filter(Boolean)
        .join('\n\n');
    return text || '无';
}

/** Proactive conversations and memories share the same typed history, with scoped references only for actionable histories. */
export function buildQQV2ProactiveSections({ kind, conversations = [] } = {}) {
    const sectionKind = kind === 'group' ? 'group' : 'private';
    return (Array.isArray(conversations) ? conversations : []).map((conversation, index) => formatQQHistorySection(conversation, {
        kind: sectionKind, numbered: true,
        referenceId: conversation.referenceId || `${sectionKind === 'group' ? 'G' : 'P'}${index + 1}`,
    })).join('\n\n') || '无';
}

export function buildQQV2GroupMemorySections(groups = []) {
    return (Array.isArray(groups) ? groups : []).map(group => formatQQHistorySection(group, { kind: 'group' })).join('\n\n') || '无';
}

export function buildQQV2PrivateMemorySections(conversations = []) {
    return (Array.isArray(conversations) ? conversations : []).map(conversation => formatQQHistorySection(conversation, { kind: 'private' })).join('\n\n') || '无';
}

export { QQ_V2_PROMPT_PLACEHOLDERS };
