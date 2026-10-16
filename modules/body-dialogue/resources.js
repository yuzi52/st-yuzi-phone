import { createIndexedDbQQV2StateStore, createQQV2SharedResourceStorage } from '../qq-v2/storage/state-store.js';
import { createQQV2ResourceService } from '../qq-v2/resources/service.js';
import { getQQV2Facade } from '../qq-v2/runtime/default-runtime.js';
import { normalizeAvatarFrameTransform } from '../qq-v2/resources/avatar-frame-transform.js';
import { normalizeBubbleStyle } from '../qq-v2/resources/appearance-contract.js';

// Read-only adapter. No QQ person, scope, media or resource is ever written here.
let source;
function reader() {
    if (!source) {
        const store = createIndexedDbQQV2StateStore();
        const resources = createQQV2ResourceService({ storage: createQQV2SharedResourceStorage({ stateStore: store }) });
        source = { store, resources };
    }
    return source;
}

export async function readDialogueLibrary() {
    const { store, resources } = reader();
    const state = await store.read();
    return {
        assets: Object.values(state.sharedResources?.imageLibraryAssets || {}),
        outfits: Object.values(state.sharedResources?.imageLibraryOutfits || {}),
        voices: await resources.listVoiceEntries(),
    };
}

export async function copyDialogueAsset(asset) {
    if (!asset) return null;
    const blob = asset.blob instanceof Blob ? asset.blob : await reader().store.readMedia(asset.mediaKey);
    if (!(blob instanceof Blob)) throw new Error('源图片已不存在，请重新选择');
    return {
        blob,
        ...(asset.avatarFrameTransform ? { avatarFrameTransform: normalizeAvatarFrameTransform(asset.avatarFrameTransform) } : {}),
        ...(asset.bubble ? { bubble: normalizeBubbleStyle(asset.bubble) } : {}),
    };
}

export async function randomDialogueAppearance() {
    const library = await readDialogueLibrary();
    const choose = items => items.length ? items[Math.floor(Math.random() * items.length)] : null;
    const byId = new Map(library.assets.map(asset => [asset.assetId, asset]));
    const outfit = choose(library.outfits.filter(item => byId.has(item.avatarFrame) && byId.has(item.bubble)));
    const pick = type => choose(library.assets.filter(asset => asset.library === type));
    const [avatar, frame, bubble] = await Promise.all([
        copyDialogueAsset(pick('avatar')),
        copyDialogueAsset(byId.get(outfit?.avatarFrame) || pick('avatar-frame')),
        copyDialogueAsset(byId.get(outfit?.bubble) || pick('bubble')),
    ]);
    const voice = choose(library.voices);
    return { avatar, frame, bubble, voice: voice ? { voiceId: voice.voiceId, name: voice.name } : null };
}

export async function readDialogueVoiceConnection() {
    // Let the existing TTS owner perform any legacy migration, never a second writer.
    const ready = await getQQV2Facade()?.query.voiceSettings();
    if (!ready?.ok) throw Object.assign(new Error('TTS 连接尚未就绪'), { code: 'voice_connection_unavailable' });
    const connection = await reader().resources.getVoiceConnection();
    if (!connection) throw Object.assign(new Error('请先在设置 → TTS 中选择连接'), { code: 'voice_preset_required' });
    return connection;
}

export async function closeDialogueResources() {
    const previous = source; source = null;
    await previous?.store.close();
}
