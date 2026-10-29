import { fileToDataUrl, loadImage } from '../settings-app/services/media-upload/core.js';
import { normalizeAvatarFrameTransform } from '../qq-v2/resources/avatar-frame-transform.js';
import { normalizeBubbleStyle } from '../qq-v2/resources/appearance-contract.js';
import { normalizeBodyDialogueColor, normalizeBodyDialogueLanguage } from './config.js';
import { BODY_DIALOGUE_EMOTIONS } from './emotions.js';

const FORMAT = 'yuzi-phone-body-dialogue-people';
const IMAGE_BYTES = 8 * 1024 * 1024;
export const BODY_DIALOGUE_PACK_BYTES = 64 * 1024 * 1024;
const slots = ['avatar', 'frame', 'bubble'];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, label) => {
    if (typeof value !== 'string') throw new Error(`${label}必须是文字`);
    return value.trim();
};

function personFields(source) {
    if (!isObject(source)) throw new Error('人物配置必须是对象');
    const name = text(source.name, '姓名');
    if (!name || /[|「」\r\n]/u.test(name)) throw new Error('姓名不能为空，也不能包含对白格式分隔符');
    const textColor = normalizeBodyDialogueColor(source.textColor);
    if (source.textColor != null && source.textColor !== '' && !textColor) throw new Error(`${name}的对白文字色必须为 #RRGGBB 格式`);
    let voice = null;
    if (source.voice != null) {
        if (!isObject(source.voice)) throw new Error(`${name}的音色配置无效`);
        const voiceId = text(source.voice.voiceId, '音色 ID');
        if (!voiceId) throw new Error(`${name}的音色 ID 不能为空`);
        voice = { voiceId, name: text(source.voice.name, '音色名字') || voiceId };
    }
    return { name, language: normalizeBodyDialogueLanguage(text(source.language ?? '', '语言')), textColor, voice };
}

function decoration(source, slot) {
    if (slot === 'frame' && source.avatarFrameTransform !== undefined) {
        const transform = source.avatarFrameTransform;
        if (!isObject(transform) || ['x', 'y', 'scale'].some(key => !Number.isFinite(transform[key]))) {
            throw new Error('头像框位置或缩放参数无效');
        }
        return { avatarFrameTransform: normalizeAvatarFrameTransform(transform) };
    }
    if (slot === 'bubble' && source.bubble !== undefined) return { bubble: normalizeBubbleStyle(source.bubble) };
    return {};
}

/** Portable data only: never copy local IDs, card bindings, connections or audio caches. */
export async function exportBodyDialoguePeoplePack(records) {
    const people = [];
    let imageBytes = 0;
    const encodeImage = async (asset, slot, label) => {
        if (!asset) return null;
        if (!(asset.blob instanceof Blob) || !asset.blob.size || !/^image\/[a-z0-9.+-]+$/i.test(asset.blob.type)) {
            throw new Error(`${label}图片无法读取`);
        }
        if (asset.blob.size > IMAGE_BYTES) throw new Error('单张图片不能超过 8MB');
        imageBytes += Math.ceil(asset.blob.size / 3) * 4;
        if (imageBytes > BODY_DIALOGUE_PACK_BYTES) throw new Error('人物配置包不能超过 64MB');
        return { dataUrl: await fileToDataUrl(asset.blob), ...decoration(asset, slot) };
    };
    for (const record of records) {
        const person = personFields(record);
        for (const slot of slots) {
            person[slot] = await encodeImage(record[slot], slot, `${person.name}的${slot === 'avatar' ? '头像' : slot === 'frame' ? '头像框' : '气泡'}`);
        }
        person.emotionAvatars = {};
        for (const { id, label } of BODY_DIALOGUE_EMOTIONS) {
            person.emotionAvatars[id] = await encodeImage(record.emotionAvatars?.[id], 'avatar', `${person.name}的${label}头像`);
        }
        people.push(person);
    }
    const pack = { format: FORMAT, schemaVersion: 1, people };
    if (new Blob([JSON.stringify(pack)]).size > BODY_DIALOGUE_PACK_BYTES) throw new Error('人物配置包不能超过 64MB');
    return pack;
}

async function decodeImage(asset, slot, name, isCurrent, decodedImages) {
    if (!isCurrent()) throw new Error('角色卡已切换或页面已关闭，已取消读取');
    if (asset === null) return null;
    if (!isObject(asset) || typeof asset.dataUrl !== 'string') throw new Error(`${name}的图片配置缺失或无效`);
    const comma = asset.dataUrl.indexOf(',');
    const match = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(asset.dataUrl.slice(0, comma));
    if (!match || asset.dataUrl.length - comma - 1 > Math.ceil(IMAGE_BYTES / 3) * 4) throw new Error('图片必须是内嵌数据，且不能超过 8MB');
    let blob = decodedImages.get(asset.dataUrl);
    if (!blob) {
        let binary;
        try { binary = atob(asset.dataUrl.slice(comma + 1)); } catch { throw new Error('图片 Base64 数据损坏'); }
        if (!binary.length || binary.length > IMAGE_BYTES) throw new Error('图片为空或超过 8MB');
        blob = new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1].toLowerCase() });
        await loadImage(asset.dataUrl);
        decodedImages.set(asset.dataUrl, blob);
    }
    return { blob, ...decoration(asset, slot) };
}

/** Decode and validate the entire file before opening a write transaction. */
export async function readBodyDialoguePeoplePack(source, isCurrent = () => true) {
    if (typeof source !== 'string' || new Blob([source]).size > BODY_DIALOGUE_PACK_BYTES) throw new Error('人物配置包不能超过 64MB');
    let pack;
    try { pack = JSON.parse(source); } catch { throw new Error('文件不是有效的 JSON'); }
    if (!isObject(pack) || pack.format !== FORMAT || pack.schemaVersion !== 1 || !Array.isArray(pack.people)) {
        throw new Error('不是支持的正文人物配置包');
    }
    if (!pack.people.length) throw new Error('配置包中没有人物');
    const people = [], names = new Set(), decodedImages = new Map();
    for (const sourcePerson of pack.people) {
        const person = personFields(sourcePerson);
        if (names.has(person.name)) throw new Error(`配置包内存在重复姓名：${person.name}`);
        names.add(person.name);
        for (const slot of slots) {
            person[slot] = await decodeImage(sourcePerson[slot], slot, person.name, isCurrent, decodedImages);
        }
        const avatars = sourcePerson.emotionAvatars ?? {};
        if (!isObject(avatars) || Object.keys(avatars).some(id => !BODY_DIALOGUE_EMOTIONS.some(emotion => emotion.id === id))) {
            throw new Error(`${person.name}的情绪头像配置无效`);
        }
        person.emotionAvatars = {};
        for (const { id } of BODY_DIALOGUE_EMOTIONS) {
            person.emotionAvatars[id] = await decodeImage(avatars[id] ?? null, 'avatar', person.name, isCurrent, decodedImages);
        }
        people.push(person);
    }
    return people;
}
