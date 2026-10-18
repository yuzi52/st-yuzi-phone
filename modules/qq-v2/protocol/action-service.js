import { t } from '../../i18n/index.js';
import { validateQQV2ActionBatch } from './xml.js';
import { parseQQResponse } from './response.js';
import { mapQQV2StickerActionReferences } from '../prompt/sticker-catalog.js';

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asReferenceSet(value) {
    if (value instanceof Map) return new Set(value.keys());
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set(Object.keys(asObject(value)));
}

function mapReference(value, references) {
    return Object.prototype.hasOwnProperty.call(references, value) ? references[value] : value;
}

function mapActionReferences(action, personReferences, messageReferences) {
    const mapped = { ...action };
    for (const key of ['sender', 'senderPersonReference', 'actor', 'target', 'recipient']) {
        if (mapped[key]) mapped[key] = mapReference(mapped[key], personReferences);
    }
    if (mapped.owner) mapped.owner = mapReference(mapped.owner, personReferences);
    if (Array.isArray(mapped.members)) {
        mapped.members = mapped.members.map((reference) => mapReference(reference, personReferences));
    }
    if (Array.isArray(mapped.mentions)) {
        mapped.mentions = mapped.mentions.map((reference) => mapReference(reference, personReferences));
    }
    for (const key of ['quote', 'message']) {
        if (mapped[key]) mapped[key] = mapReference(mapped[key], messageReferences);
    }
    return mapped;
}

/**
 * QQ 输出到领域事务的唯一执行入口。两种输出格式共用校验和原子提交。
 */
export function createQQV2ActionService(options = {}) {
    const repository = options.repository;
    if (!repository || typeof repository.getConversation !== 'function' || typeof repository.applyAIActions !== 'function') {
        throw new TypeError(t("QQ v2 action service 需要 repository"));
    }
    const parseResponse = typeof options.parseResponse === 'function' ? options.parseResponse : parseQQResponse;
    const validateActions = typeof options.validateActions === 'function' ? options.validateActions : validateQQV2ActionBatch;

    return Object.freeze({
        async execute(input = {}) {
            const scopeId = String(input.scopeId ?? '').trim();
            if (!scopeId) throw new TypeError(t("QQ v2 action service 需要 scopeId"));
            const isCurrent = typeof input.isCurrent === 'function' ? input.isCurrent : () => true;
            if (!isCurrent()) {
                const error = new Error(t("QQ AI 动作批次已被新的请求取代"));
                error.code = 'request_cancelled';
                throw error;
            }
            const references = asObject(input.references);
            const conversations = new Map();
            for (const [reference, conversationId] of Object.entries(references)) {
                conversations.set(reference, await repository.getConversation(scopeId, conversationId));
            }
            const personReferences = asObject(input.personReferences);
            const protocolNames = asObject(input.protocolNames);
            // Names refer to the roster shown to the model; commit-time permissions still use live state.
            const personNames = asObject(protocolNames.people);
            const conversationNames = asObject(protocolNames.conversations);
            const people = new Map();
            if (parseResponse === parseQQResponse) {
                const ids = new Set([...Object.values(personReferences), ...[...conversations.values()].map(item => item?.personId).filter(Boolean)]);
                await Promise.all([...ids].map(async id => {
                    const person = await repository.getPerson(scopeId, id);
                    if (person) people.set(id, { ...person, formalName: personNames[id] || person.formalName });
                }));
                await Promise.all([...conversations].map(async ([reference, conversation]) => {
                    if (!conversation) return;
                    conversation.name = conversationNames[reference] || (conversation.kind === 'private'
                        ? people.get(conversation.personId)?.formalName
                        : (await repository.getGroup(scopeId, conversation.groupId))?.name);
                }));
            }
            const messageReferences = asObject(input.messageReferences);
            const visibleMessageRefs = asReferenceSet(input.visibleMessageRefs);
            const assistantTargets = [...conversations.values()].filter(item => item?.assistantCharacterId);
            const actions = await parseResponse(input.response, {
                ...input.parseOptions, scenario: input.scenario, conversations, people, personReferences,
                visibleMessageRefs, stickerDescriptions: input.stickerDescriptions,
                assistant: assistantTargets.length > 0,
            });
            if (assistantTargets.length && (conversations.size !== 1 || actions.some(action => !['message', 'transfer'].includes(action.type)))) {
                throw Object.assign(new Error(t("陪聊只能回复当前会话或处理转账")), { code: 'assistant_action_forbidden' });
            }
            if (input.diagnostic) input.diagnostic.stage = 'validate';
            await validateActions(actions, {
                scenario: input.scenario,
                conversations,
                stickers: input.stickers,
                visibleMessageRefs,
            });
            const assistantPerson = assistantTargets.length === 1
                ? await repository.getPerson(scopeId, assistantTargets[0].personId)
                : null;
            const mappedActions = mapQQV2StickerActionReferences(
                actions.map((action) => {
                    const mapped = mapActionReferences(action, personReferences, messageReferences);
                    // 仅兼容当前陪聊人物的完整姓名；标准引用优先，不扩展 actor/recipient 等字段。
                    if (action.type === 'message' && assistantPerson?.formalName
                        && action.sender === assistantPerson.formalName
                        && !Object.hasOwn(personReferences, action.sender)) {
                        mapped.sender = assistantTargets[0].personId;
                    }
                    return mapped;
                }),
                asObject(input.stickerReferences),
            );
            if (!isCurrent()) {
                const error = new Error(t("QQ AI 动作批次已被新的请求取代"));
                error.code = 'request_cancelled';
                throw error;
            }
            if (input.diagnostic) input.diagnostic.stage = 'save';
            try {
                return await repository.applyAIActions(scopeId, mappedActions, {
                    references,
                    storyTime: input.storyTime,
                    handledUserSequences: input.handledUserSequences,
                    scopeSession: input.scopeSession,
                    isCurrent,
                });
            } catch (error) {
                if (error.qqLine && !error.message.startsWith('QQ 块第 ')) {
                    error.message = `QQ 块第 ${error.qqLine} 行：${error.message}`;
                }
                throw error;
            }
        },
    });
}
