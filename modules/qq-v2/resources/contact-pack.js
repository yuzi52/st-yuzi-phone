import { requireImageMimeType, requireDataUrl, dataUrlToBlob, blobToDataUrl } from './image-pack-codec.js';
import { normalizeAvatarFrameTransform } from './avatar-frame-transform.js';
import { normalizeBubbleStyle } from './appearance-contract.js';
import { normalizeMessageTextColor } from '../domain/message-text-color.js';
import { normalizeQQContactVoice, resolveQQProfileVoice } from '../voice/contact-voice.js';
import { t } from '../../i18n/index.js';
const PRIVATE_CONTACT_STATUSES = new Set(['active', 'contact']);

export const QQ_CONTACT_PACK_FORMAT = 'yuzi-phone-qq-contact-pack';
export const QQ_CONTACT_PACK_SCHEMA_VERSION = 1;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asLiteralText(value, maxLength = 0) {
    const text = String(value ?? '');
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireRepository(repository) {
    const required = [
        'listConversations',
        'getPerson',
        'getMediaAsset',
        'importPrivateContacts',
    ];
    if (required.some((name) => typeof repository?.[name] !== 'function')) {
        throw new TypeError(t("QQ 联系人资料包需要有效的 repository"));
    }
    return repository;
}

function requireTextField(value, label, maxLength, { required = false } = {}) {
    if (typeof value !== 'string') throw new Error(t`${label}必须是字符串`);
    if (value.length > maxLength) throw new Error(t`${label}过长`);
    if (required && !value.trim()) throw new Error(t`${label}不能为空`);
    return value;
}

function parsePack(input) {
    const pack = typeof input === 'string' ? JSON.parse(input) : input;
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error(t("联系人资料包必须是 JSON 对象"));
    if (pack.format !== QQ_CONTACT_PACK_FORMAT) {
        throw new Error(t`联系人资料包 format 必须是 ${QQ_CONTACT_PACK_FORMAT}`);
    }
    if (Number(pack.schemaVersion) !== QQ_CONTACT_PACK_SCHEMA_VERSION) {
        throw new Error(t`联系人资料包 schemaVersion 必须是 ${QQ_CONTACT_PACK_SCHEMA_VERSION}`);
    }
    if (!Array.isArray(pack.contacts)) throw new Error(t("联系人资料包 contacts 必须是数组"));
    return pack.contacts;
}

function imageParameters(source, kind, label) {
    if (kind === 'avatar-frame' && source.avatarFrameTransform !== undefined) {
        const transform = source.avatarFrameTransform;
        if (!transform || typeof transform !== 'object' || Array.isArray(transform)
            || Object.keys(transform).some((key) => !['x', 'y', 'scale'].includes(key))
            || ['x', 'y', 'scale'].some((key) => !Number.isFinite(transform[key]))) {
            throw new Error(t`${label}的头像框位置或缩放参数无效`);
        }
        return { avatarFrameTransform: normalizeAvatarFrameTransform(transform) };
    }
    if (kind === 'bubble' && source.bubble !== undefined) {
        return { bubble: normalizeBubbleStyle(source.bubble) };
    }
    return {};
}

function importImage(raw, label, kind = '') {
    if (raw === null) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(t`${label}必须是图片对象或 null`);
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    return {
        blob: dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType),
        mimeType,
        ...imageParameters(source, kind, label),
    };
}

function importVoice(raw, label) {
    if (raw === null || raw === undefined) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(t`${label}必须是音色对象或 null`);
    return normalizeQQContactVoice({
        voiceId: requireTextField(raw.voiceId, `${label}.voiceId`, 256, { required: true }),
        name: requireTextField(raw.name ?? '', `${label}.name`, 256),
        volume: raw.volume,
    });
}

function normalizeImportedContacts(input) {
    return parsePack(input).map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error(t`contacts[${index}]必须是对象`);
        }
        const source = asObject(raw);
        const messageTextColor = source.messageTextColor === undefined ? 'black' : source.messageTextColor;
        if (messageTextColor !== 'white' && messageTextColor !== 'black') {
            throw new Error(t("消息字色只能选择白色或黑色"));
        }
        return {
            formalName: requireTextField(source.name, `contacts[${index}].name`, 120, { required: true }),
            signature: requireTextField(source.signature, `contacts[${index}].signature`, 1000),
            gender: requireTextField(source.gender, `contacts[${index}].gender`, 120),
            birthday: requireTextField(source.birthday, `contacts[${index}].birthday`, 120),
            avatar: importImage(source.avatar, `contacts[${index}].avatar`),
            profileBackground: importImage(source.profileBackground, `contacts[${index}].profileBackground`),
            chatBackground: importImage(source.chatBackground, `contacts[${index}].chatBackground`),
            ...(Object.hasOwn(source, 'avatarFrame') ? {
                avatarFrame: importImage(source.avatarFrame, `contacts[${index}].avatarFrame`, 'avatar-frame'),
            } : {}),
            ...(Object.hasOwn(source, 'bubble') ? {
                bubble: importImage(source.bubble, `contacts[${index}].bubble`, 'bubble'),
            } : {}),
            messageTextColor,
            voice: importVoice(source.voice, `contacts[${index}].voice`),
        };
    });
}

async function exportImage(repository, scopeId, assetId, expectedKind, label) {
    const id = asText(assetId, 256);
    if (!id) return null;
    const asset = await repository.getMediaAsset(scopeId, id);
    if (asset?.kind !== expectedKind || !(asset.blob instanceof Blob)) {
        throw new Error(t`${label}图片不可读取`);
    }
    const mimeType = requireImageMimeType(asset.mimeType || asset.blob.type, label);
    return {
        mimeType,
        dataUrl: await blobToDataUrl(asset.blob, mimeType),
        ...imageParameters(asset, expectedKind, label),
    };
}

async function exportVoice(person, listVoiceEntries) {
    return resolveQQProfileVoice(person, await listVoiceEntries())
        || normalizeQQContactVoice({ voiceId: person.voiceId });
}

async function exportContact(repository, scopeId, conversation, listVoiceEntries) {
    const person = await repository.getPerson(scopeId, conversation.personId);
    if (!person) throw new Error(t("联系人资料不存在"));
    return {
        name: asLiteralText(person.formalName, 120),
        signature: asLiteralText(person.signature, 1000),
        gender: asLiteralText(person.gender, 120),
        birthday: asLiteralText(person.birthday, 120),
        avatar: await exportImage(repository, scopeId, person.avatarAssetId, 'avatar', '头像'),
        avatarFrame: await exportImage(repository, scopeId, person.avatarFrameAssetId, 'avatar-frame', '头像框'),
        bubble: await exportImage(repository, scopeId, person.bubbleAssetId, 'bubble', '气泡'),
        messageTextColor: normalizeMessageTextColor(person.messageTextColor),
        voice: await exportVoice(person, listVoiceEntries),
        profileBackground: await exportImage(
            repository,
            scopeId,
            person.profileBackgroundAssetId,
            'profile-background',
            '资料背景',
        ),
        chatBackground: await exportImage(
            repository,
            scopeId,
            conversation.backgroundAssetId,
            'background',
            '聊天背景',
        ),
    };
}

export function createQQContactPackService(options = {}) {
    const repository = requireRepository(options.repository);
    const listVoiceEntries = typeof options.listVoiceEntries === 'function' ? options.listVoiceEntries : async () => [];

    return Object.freeze({
        async exportPack({ scopeId } = {}) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) throw new Error(t("QQ 作用域不可用"));
            const conversations = await repository.listConversations(normalizedScopeId);
            let voiceEntriesPromise;
            const voiceEntries = () => {
                voiceEntriesPromise ||= Promise.resolve().then(listVoiceEntries)
                    .then((entries) => Array.isArray(entries) ? entries : []);
                return voiceEntriesPromise;
            };
            const contacts = await Promise.all(conversations
                .filter((conversation) => (
                    !conversation?.assistantCharacterId && conversation?.kind === 'private'
                    && PRIVATE_CONTACT_STATUSES.has(asText(conversation.status, 32))
                ))
                .map((conversation) => exportContact(repository, normalizedScopeId, conversation, voiceEntries)));
            return {
                format: QQ_CONTACT_PACK_FORMAT,
                schemaVersion: QQ_CONTACT_PACK_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                contacts,
            };
        },
        previewPack(input) {
            return Object.freeze({ contacts: normalizeImportedContacts(input).length });
        },
        async importPack({ scopeId, source, operationOptions = {} } = {}) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) throw new Error(t("QQ 作用域不可用"));
            const contacts = normalizeImportedContacts(source);
            const imported = await repository.importPrivateContacts(
                normalizedScopeId,
                contacts,
                operationOptions,
            );
            return Object.freeze({ contacts: imported.length });
        },
    });
}
