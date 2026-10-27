import { requireImageMimeType, requireDataUrl, dataUrlToBlob, blobToDataUrl } from './image-pack-codec.js';
import { normalizeBubbleStyle, normalizeOutfits, QQ_OUTFIT_SLOTS } from './appearance-contract.js';
import { normalizeAvatarFrameTransform } from './avatar-frame-transform.js';
import { sha256Text } from './content-hash.js';
import { t } from '../../i18n/index.js';
const IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const STICKERS_KEY = 'qq-v2.resources.stickers';
const IMAGE_LIBRARIES = Object.freeze({
    avatarFrames: Object.freeze({ library: 'avatar-frame', kind: 'avatar-frame' }),
    bubbles: Object.freeze({ library: 'bubble', kind: 'bubble' }),
    avatars: Object.freeze({ library: 'avatar', kind: 'avatar' }),
    profileBackgrounds: Object.freeze({ library: 'profile-background', kind: 'profile-background' }),
    chatBackgrounds: Object.freeze({ library: 'chat-background', kind: 'background' }),
});
export const QQ_IMAGE_LIBRARY_PACK_FORMAT = 'yuzi-phone-qq-image-library-pack';
export const QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION = 1;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireStateStore(stateStore) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.transact !== 'function') {
        throw new TypeError(t("QQ 图片资料包需要有效的 state store"));
    }
    return stateStore;
}

function requireUniqueId(value, label, usedIds) {
    const id = asText(value, 256);
    if (!id) throw new Error(t`${label}缺少资源 ID`);
    if (usedIds.has(id)) throw new Error(t`资源 ID 重复：${id}`);
    usedIds.add(id);
    return id;
}

function appendableId(value, usedIds) {
    const sourceId = asText(value, 256);
    let candidate = sourceId;
    for (let index = 1; usedIds.has(candidate); index += 1) {
        const suffix = `(${index})`;
        candidate = `${sourceId.slice(0, 256 - suffix.length)}${suffix}`;
    }
    usedIds.add(candidate);
    return candidate;
}

async function resolveBlob(record, readMedia) {
    if (record?.blob instanceof Blob) return record.blob;
    return readMedia(record?.mediaKey);
}

async function exportImageAsset(asset, usedIds, readMedia) {
    const blob = await resolveBlob(asset, readMedia);
    if (!(blob instanceof Blob)) throw new Error(t`图片资源 ${asset?.assetId || ''} 缺少 Blob`);
    const label = `图片资源 ${asset.assetId || ''}`;
    const id = requireUniqueId(asset.assetId, label, usedIds);
    const mimeType = requireImageMimeType(asset.mimeType || blob.type, label);
    return {
        id,
        mimeType,
        createdAt: Math.max(0, Number(asset.createdAt) || 0),
        dataUrl: await blobToDataUrl(blob, mimeType),
        ...(asset.library === 'avatar-frame' && asset.avatarFrameTransform ? {
            avatarFrameTransform: normalizeAvatarFrameTransform(asset.avatarFrameTransform),
        } : {}),
        ...(asset.bubble ? { bubble: asset.bubble } : {}),
        ...(asset.origin ? { origin: asset.origin } : {}),
    };
}

async function exportSticker(sticker, usedIds, readMedia) {
    const blob = await resolveBlob(sticker, readMedia);
    if (!(blob instanceof Blob)) throw new Error(t`表情资源 ${sticker?.id || ''} 缺少 Blob`);
    const label = `表情资源 ${sticker.id || ''}`;
    const id = requireUniqueId(sticker.id, label, usedIds);
    const description = asText(sticker.description, 4000);
    if (!description) throw new Error(t`${label}缺少表情含义`);
    const mimeType = requireImageMimeType(sticker.mimeType || blob.type, label);
    return {
        id,
        description,
        mimeType,
        order: Math.max(0, Number(sticker.order) || 0),
        dataUrl: await blobToDataUrl(blob, mimeType),
    };
}

function parsePack(pack) {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error(t("图片资料包必须是 JSON 对象"));
    if (pack.format !== QQ_IMAGE_LIBRARY_PACK_FORMAT) {
        throw new Error(t`图片资料包 format 必须是 ${QQ_IMAGE_LIBRARY_PACK_FORMAT}`);
    }
    if (Number(pack.schemaVersion) !== QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION) {
        throw new Error(t`图片资料包 schemaVersion 必须是 ${QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION}`);
    }
    const libraries = { ...pack.libraries };
    if (!libraries || typeof libraries !== 'object' || Array.isArray(libraries)) {
        throw new Error(t("图片资料包缺少 libraries"));
    }
    for (const key of ['avatarFrames', 'bubbles']) { if (libraries[key] === undefined) libraries[key] = []; }
    for (const key of [...Object.keys(IMAGE_LIBRARIES), 'stickers']) {
        if (!Array.isArray(libraries[key])) throw new Error(t`图片资料包 libraries.${key} 必须是数组`);
    }
    return libraries;
}

function importImageAsset(raw, key, index, usedIds) {
    const label = `${key}[${index}]`;
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    const blob = dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType);
    const definition = IMAGE_LIBRARIES[key];
    return {
        assetId: requireUniqueId(source.id, label, usedIds),
        scopeId: '',
        conversationId: '',
        kind: definition.kind,
        library: definition.library,
        ...(source.origin ? { origin: asText(source.origin, 256) } : {}),
        ...(definition.library === 'avatar-frame' && source.avatarFrameTransform ? {
            avatarFrameTransform: normalizeAvatarFrameTransform(source.avatarFrameTransform),
        } : {}),
        ...(definition.library === 'bubble' && source.bubble !== undefined ? { bubble: normalizeBubbleStyle(source.bubble) } : {}),
        blob,
        mimeType,
        createdAt: Math.max(0, Number(source.createdAt) || 0),
    };
}

function importSticker(raw, index, usedIds) {
    const label = `stickers[${index}]`;
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    const blob = dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType);
    const description = asText(source.description, 4000);
    if (!description) throw new Error(t`${label}缺少表情含义`);
    return {
        id: requireUniqueId(source.id, label, usedIds),
        description,
        mimeType,
        size: blob.size,
        order: index,
        blob,
    };
}

function normalizeImportedLibraries(input) {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    const libraries = parsePack(raw);
    const usedImageIds = new Set();
    const images = {};
    for (const key of Object.keys(IMAGE_LIBRARIES)) {
        libraries[key].forEach((raw, index) => {
            const asset = importImageAsset(raw, key, index, usedImageIds);
            images[asset.assetId] = asset;
        });
    }
    const usedStickerIds = new Set();
    const stickers = libraries.stickers.map((raw, index) => importSticker(raw, index, usedStickerIds));
    return { images, stickers, outfits: normalizeOutfits(raw.outfits, images) };
}

export function createQQImageLibraryPackService(options = {}) {
    const stateStore = requireStateStore(options.stateStore);
    const readMedia = typeof stateStore.readMedia === 'function'
        ? (key) => stateStore.readMedia(key)
        : async () => null;

    const service = {
        async importBeautifyPreset(record) {
            const libraries = { avatars: [], profileBackgrounds: [], chatBackgrounds: [], stickers: [], avatarFrames: [], bubbles: [] };
            const remapped = new Map();
            for (const resource of record.qq?.resources || []) {
                const key = Object.keys(IMAGE_LIBRARIES).find(key => IMAGE_LIBRARIES[key].library === resource.library);
                const file = record.files?.[resource.file];
                if (!key || !file || file.encoding !== 'base64') throw new Error('QQ 美化图片资源无效');
                const origin = await sha256Text(JSON.stringify([record.id, resource.id, resource.library, resource.bubble || null, file.mimeType, file.content]));
                const id = 'beautify-' + origin;
                remapped.set(resource.id, id);
                libraries[key].push({ id, origin, mimeType: file.mimeType, dataUrl: 'data:' + file.mimeType + ';base64,' + file.content, ...(resource.bubble ? { bubble: resource.bubble } : {}) });
            }
            const outfits = [];
            for (const source of record.qq?.outfits || []) {
                const slots = Object.fromEntries(Object.keys(QQ_OUTFIT_SLOTS).filter(slot => source[slot]).map(slot => [slot, remapped.get(source[slot])]));
                outfits.push({ id: 'beautify-' + await sha256Text(JSON.stringify([record.id, source.id, slots])), ...slots });
            }
            return service.importPack({ format: QQ_IMAGE_LIBRARY_PACK_FORMAT, schemaVersion: 1, libraries, outfits });
        },
        async exportPack() {
            const state = await stateStore.read();
            const assets = Object.values(asObject(state.sharedResources?.[IMAGE_LIBRARY_KEY]));
            const stickers = Array.isArray(state.sharedResources?.[STICKERS_KEY]?.stickers)
                ? state.sharedResources[STICKERS_KEY].stickers
                : [];
            const libraries = {};
            const usedImageIds = new Set();
            for (const [key, definition] of Object.entries(IMAGE_LIBRARIES)) {
                if (['avatarFrames', 'bubbles'].includes(key) && !assets.some(asset => asset.library === definition.library)) continue;
                libraries[key] = await Promise.all(assets
                    .filter((asset) => asset?.library === definition.library)
                    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
                    .map((asset) => exportImageAsset(asset, usedImageIds, readMedia)));
            }
            const usedStickerIds = new Set();
            libraries.stickers = await Promise.all([...stickers]
                .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
                .map((sticker) => exportSticker(sticker, usedStickerIds, readMedia)));
            return {
                format: QQ_IMAGE_LIBRARY_PACK_FORMAT,
                schemaVersion: QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                libraries,
                ...(Object.keys(state.sharedResources?.imageLibraryOutfits || {}).length ? { outfits: Object.values(state.sharedResources.imageLibraryOutfits) } : {}),
            };
        },
        async importPack(input) {
            const imported = normalizeImportedLibraries(input);
            await stateStore.transact((state) => {
                if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                    state.sharedResources = {};
                }
                const images = asObject(state.sharedResources[IMAGE_LIBRARY_KEY]);
                const usedImageIds = new Set(Object.keys(images));
                const remapped = new Map();
                let imagesByOrigin;
                Object.values(imported.images).forEach((asset) => {
                    if (asset.origin && imagesByOrigin === undefined) {
                        const records = Object.values(images);
                        // Keep the legacy lookup's short-circuit errors for malformed stored records.
                        imagesByOrigin = records.every(value => value !== null && typeof value === 'object') ? new Map() : null;
                        if (imagesByOrigin) {
                            for (const value of records) {
                                if (!imagesByOrigin.has(value.origin)) imagesByOrigin.set(value.origin, value);
                            }
                        }
                    }
                    const existing = asset.origin && (imagesByOrigin
                        ? imagesByOrigin.get(asset.origin)
                        : Object.values(images).find(value => value.origin === asset.origin));
                    if (existing) { remapped.set(asset.assetId, existing.assetId); return; }
                    const assetId = appendableId(asset.assetId, usedImageIds);
                    images[assetId] = { ...asset, assetId };
                    if (imagesByOrigin && asset.origin) imagesByOrigin.set(asset.origin, images[assetId]);
                    remapped.set(asset.assetId, assetId);
                });
                state.sharedResources[IMAGE_LIBRARY_KEY] = images;
                const outfits = state.sharedResources.imageLibraryOutfits ||= {};
                const outfitIds = new Set(Object.keys(outfits));
                for (const outfit of imported.outfits) {
                    const slots = Object.fromEntries(Object.keys(QQ_OUTFIT_SLOTS).filter(slot => outfit[slot]).map(slot => [slot, remapped.get(outfit[slot])]));
                    if (outfits[outfit.id] && Object.entries(slots).every(([slot, assetId]) => outfits[outfit.id][slot] === assetId)) continue;
                    const id = appendableId(outfit.id, outfitIds);
                    outfits[id] = { id, ...slots };
                }

                const stickerState = asObject(state.sharedResources[STICKERS_KEY]);
                const stickers = Array.isArray(stickerState.stickers) ? stickerState.stickers : [];
                const usedStickerIds = new Set(stickers.map((sticker) => asText(sticker?.id, 256)).filter(Boolean));
                const nextStickerOrder = stickers.reduce(
                    (highest, sticker) => Math.max(highest, Number(sticker?.order) || 0),
                    -1,
                ) + 1;
                const appendedStickers = imported.stickers.map((sticker, index) => ({
                    ...sticker,
                    id: appendableId(sticker.id, usedStickerIds),
                    order: nextStickerOrder + index,
                }));
                state.sharedResources[STICKERS_KEY] = {
                    ...stickerState,
                    stickers: [...stickers, ...appendedStickers],
                };
            });
            const avatarFrames = Object.values(imported.images).filter((asset) => asset.library === 'avatar-frame').length;
            const bubbles = Object.values(imported.images).filter((asset) => asset.library === 'bubble').length;
            return {
                avatars: Object.values(imported.images).filter((asset) => asset.library === 'avatar').length,
                profileBackgrounds: Object.values(imported.images).filter((asset) => asset.library === 'profile-background').length,
                chatBackgrounds: Object.values(imported.images).filter((asset) => asset.library === 'chat-background').length,
                ...(avatarFrames ? { avatarFrames } : {}),
                ...(bubbles ? { bubbles } : {}),
                ...(imported.outfits.length ? { outfits: imported.outfits.length } : {}),
                stickers: imported.stickers.length,
            };
        },
    };
    return Object.freeze(service);
}
