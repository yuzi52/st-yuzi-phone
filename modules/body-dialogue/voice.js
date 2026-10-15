import { synthesizeQQVoice } from '../qq-v2/voice/fish-client.js';
import { prepareQQVoiceText } from '../qq-v2/voice/service.js';
import { createVoicePlaybackController } from '../qq-v2/voice/playback.js';
import { qqFailureLog } from '../qq-v2/request/failure-log.js';
import { getQQV2RuntimeStatus } from '../qq-v2/runtime/default-runtime.js';
import { showNotification } from '../integration/toast-bridge.js';
import { bodyDialogueRepository as repository } from './repository.js';
import { readDialogueVoiceConnection } from './resources.js';
import { normalizeQQVoiceSpeechControls } from '../qq-v2/voice/speech-controls.js';

export async function dialogueDigest(value) {
    if (globalThis.crypto?.subtle) {
        const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // LAN HTTP has no SubtleCrypto. These are cache identifiers, not security digests.
    let first = 0x811c9dc5, second = 0x9e3779b9;
    for (let index = 0; index < value.length; index++) {
        first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
        second = Math.imul(second ^ value.charCodeAt(index), 0x5bd1e995);
    }
    return `${value.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function createBodyDialogueVoice() {
    const playback = createVoicePlaybackController();
    let current = null, generation = 0;
    const update = () => {
        if (current?.button?.isConnected) {
            current.button.textContent = current.loading ? '◌' : playback.isPlaying(current.id) ? 'Ⅱ' : '▷';
            current.button.setAttribute('aria-busy', String(current.loading));
            current.button.setAttribute('aria-label', current.loading ? '正在合成对白' : playback.isPlaying(current.id) ? '暂停朗读' : '播放对白');
        }
    };
    playback.subscribe(update);
    const stop = () => {
        generation++; current?.controller?.abort(); playback.stop();
        if (current?.button) { current.button.textContent = '▷'; current.button.setAttribute('aria-busy', 'false'); }
        current = null;
    };
    return {
        stop,
        async play({ card, chat, floor, fingerprint, dialogue, speechText = dialogue.text, speechControls = null, person, button, isCurrent }) {
            if (current?.button === button && current.loading) return;
            if (!person?.voice?.voiceId) { showNotification('请先在正文人物管理中创建该人物并选择音色', 'info'); return; }
            const same = current?.button === button;
            if (!same) stop();
            const token = generation;
            const controller = new AbortController();
            if (!same) current = { button, loading: true, controller, id: '' };
            else current.controller = controller;
            update();
            const valid = () => token === generation && isCurrent() && button.isConnected;
            const attempt = qqFailureLog.begin({ source: '正文朗读', kind: 'tts', scopeId: getQQV2RuntimeStatus().scopeId });
            try {
                const connection = await readDialogueVoiceConnection();
                if (!valid()) return;
                const signature = await dialogueDigest(JSON.stringify(connection.settings));
                const controls = speechControls ? normalizeQQVoiceSpeechControls(speechControls) : null;
                const id = 'audio:' + await dialogueDigest(JSON.stringify([chat, floor, fingerprint, dialogue.start, speechText, person.voice.voiceId, signature,
                    ...(controls ? [controls] : [])]));
                if (!valid()) return;
                current.id = id;
                current.loading = true; update();
                let media = await repository.getMedia(id);
                if (!valid()) return;
                if (!media) {
                    const text = prepareQQVoiceText(speechText).text;
                    attempt.apiKey = connection.apiKey; attempt.model = connection.settings.model; attempt.stage = 'request';
                    media = await synthesizeQQVoice({ ...connection.settings, apiKey: connection.apiKey, voiceId: person.voice.voiceId,
                        text, speechControls: controls, signal: controller.signal });
                    if (!valid()) return;
                    await repository.putAudio({ id, card, chat, floor, fingerprint, personId: person.id, voiceId: person.voice.voiceId, signature }, media.blob);
                    if (!valid()) { await repository.pruneAudio(chat, entry => entry.id !== id); return; }
                }
                current.loading = false;
                const url = URL.createObjectURL(media.blob);
                await playback.play({ key: id, url, release: () => URL.revokeObjectURL(url) });
                if (!valid()) { playback.stop(); return; }
                update();
            } catch (error) {
                if (!valid() || error?.code === 'voice_aborted') return;
                qqFailureLog.record(attempt, error);
                stop(); showNotification(error.message || '正文朗读失败，请再次点击重试', 'error');
            }
        },
    };
}
