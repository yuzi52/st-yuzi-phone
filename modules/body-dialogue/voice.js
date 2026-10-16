import { synthesizeQQVoice } from '../qq-v2/voice/fish-client.js';
import { prepareQQVoiceText } from '../qq-v2/voice/service.js';
import { createVoicePlaybackController } from '../qq-v2/voice/playback.js';
import { qqFailureLog } from '../qq-v2/request/failure-log.js';
import { getQQV2RuntimeStatus } from '../qq-v2/runtime/default-runtime.js';
import { showNotification } from '../integration/toast-bridge.js';
import { bodyDialogueRepository as repository } from './repository.js';
import { readDialogueVoiceConnection } from './resources.js';
import { normalizeQQVoiceSpeechControls } from '../qq-v2/voice/speech-controls.js';

const CONNECTION_ERRORS = new Set(['voice_connection_unavailable', 'voice_preset_required', 'voice_api_key_missing',
    'voice_endpoint_invalid', 'voice_endpoint_missing', 'voice_proxy_disabled', 'voice_model_invalid',
    'voice_fetch_unavailable', 'voice_network_failed', 'voice_timeout']);
const blocksPreGeneration = error => CONNECTION_ERRORS.has(error?.code)
    || [401, 403, 404, 408, 429].includes(error?.status) || error?.status >= 500;

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
    const requests = new Map();
    let current = null, generation = 0, batch = null;
    // Only the latest floor is tracked. Failed lines wait for an explicit click, including after a style rebuild.
    const failed = new Set();
    let failureScope = '', connectionBlocked = false;
    const scopeOf = args => JSON.stringify([args.chat, args.floor, args.fingerprint]);
    const prepareConnection = async () => {
        const connection = await readDialogueVoiceConnection();
        return { connection, signature: await dialogueDigest(JSON.stringify(connection.settings)) };
    };
    const update = button => {
        if (!button?.isConnected) return;
        const selected = current?.button === button ? current : null;
        const loading = Boolean(selected?.loading || requests.get(button)?.loading);
        const playing = Boolean(selected && playback.isPlaying(selected.id));
        button.textContent = loading ? '◌' : playing ? 'Ⅱ' : '▷';
        button.setAttribute('aria-busy', String(loading));
        button.setAttribute('aria-label', loading
            ? selected ? '正在合成对白，完成后播放' : '正在预生成语音，点击后完成即播放'
            : playing ? '暂停朗读' : '播放对白');
    };
    playback.subscribe(() => update(current?.button));
    const cancelRequest = request => {
        request.controller.abort();
        if (requests.get(request.button) === request) requests.delete(request.button);
        update(request.button);
    };
    const stopPlayback = () => {
        const previous = current;
        current = null;
        if (previous?.request && !previous.request.batch) cancelRequest(previous.request);
        playback.stop(); update(previous?.button);
    };
    const stopPreGeneration = () => {
        const previous = batch; batch = null;
        if (!previous) return;
        for (const request of requests.values()) if (request.batch === previous) {
            request.batch = null;
            // An explicit click now owns this request even if automatic generation is switched off.
            if (current?.request !== request) cancelRequest(request);
        }
    };
    const stop = (resetFailures = false) => {
        generation++; stopPreGeneration(); stopPlayback();
        for (const request of requests.values()) cancelRequest(request);
        if (resetFailures) { failed.clear(); connectionBlocked = false; }
    };
    // Both entry points share the in-flight request as well as the existing persistent cache.
    const getAudio = (args, owner = null) => {
        const { card, chat, floor, fingerprint, dialogue, speechText = dialogue.text, speechControls = null, person, button, isCurrent } = args;
        const existing = requests.get(button);
        if (existing) {
            if (owner) { existing.batch = owner; owner.connection ||= existing.connection; }
            return existing;
        }
        const request = { button, controller: new AbortController(), batch: owner, loading: false };
        const token = generation;
        const valid = () => token === generation && !request.controller.signal.aborted && isCurrent() && button.isConnected;
        requests.set(button, request);
        request.promise = (async () => {
            const attempt = qqFailureLog.begin({ source: '正文朗读', kind: 'tts', scopeId: getQQV2RuntimeStatus().scopeId });
            try {
                request.connection = owner?.connection || prepareConnection();
                if (owner) owner.connection = request.connection;
                const { connection, signature } = await request.connection;
                if (!valid()) return;
                const controls = speechControls ? normalizeQQVoiceSpeechControls(speechControls) : null;
                const id = 'audio:' + await dialogueDigest(JSON.stringify([chat, floor, fingerprint, dialogue.start, speechText, person.voice.voiceId, signature,
                    ...(controls ? [controls] : [])]));
                if (!valid()) return;
                request.id = id;
                if (owner && failed.has(id)) return;
                let media = await repository.getMedia(id);
                if (!valid()) return;
                if (!media) {
                    request.loading = true; update(button);
                    const text = prepareQQVoiceText(speechText).text;
                    attempt.apiKey = connection.apiKey; attempt.model = connection.settings.model; attempt.stage = 'request';
                    media = await synthesizeQQVoice({ ...connection.settings, apiKey: connection.apiKey, voiceId: person.voice.voiceId,
                        text, speechControls: controls, signal: request.controller.signal });
                    if (!valid()) return;
                    await repository.putAudio({ id, card, chat, floor, fingerprint, personId: person.id, voiceId: person.voice.voiceId, signature }, media.blob);
                    if (!valid()) { await repository.pruneAudio(chat, entry => entry.id !== id); return; }
                    connectionBlocked = false;
                }
                failed.delete(id);
                return { id, blob: media.blob };
            } catch (error) {
                if (!valid() || error?.code === 'voice_aborted') return;
                if (request.id && failureScope === scopeOf(args)) failed.add(request.id);
                qqFailureLog.record(attempt, error);
                throw error;
            } finally {
                if (requests.get(button) === request) requests.delete(button);
                request.loading = false; update(button);
            }
        })();
        return request;
    };
    return {
        stop,
        stopPreGeneration,
        async preGenerate(key, items) {
            if (batch?.key === key) return;
            stopPreGeneration();
            const queue = typeof items === 'function' ? items() : items;
            const scope = queue.length ? scopeOf(queue[0]) : '';
            if (scope !== failureScope) { failureScope = scope; failed.clear(); connectionBlocked = false; }
            const owner = { key }; batch = owner;
            if (connectionBlocked) return;
            for (const args of queue) {
                if (batch !== owner) break;
                if (!args.person?.voice?.voiceId || !args.button.isConnected || !args.isCurrent()) continue;
                try { await getAudio(args, owner).promise; }
                catch (error) {
                    // A bad connection affects every remaining line; a bad line only skips itself.
                    if (blocksPreGeneration(error)) { connectionBlocked = true; break; }
                }
            }
        },
        async play(args) {
            const { person, button, isCurrent } = args;
            if (current?.button === button && current.loading) return;
            if (!person?.voice?.voiceId) { showNotification('请先在正文人物管理中创建该人物并选择音色', 'info'); return; }
            if (current?.button !== button) stopPlayback();
            const selection = { button, loading: true, id: '', request: null };
            current = selection; update(button);
            let playing = false;
            try {
                selection.request = getAudio(args);
                const media = await selection.request.promise;
                if (current !== selection) return;
                if (!media || !isCurrent() || !button.isConnected) { stopPlayback(); return; }
                selection.id = media.id; selection.loading = false;
                playing = true;
                const url = URL.createObjectURL(media.blob);
                await playback.play({ key: media.id, url, release: () => URL.revokeObjectURL(url) });
                if (current === selection) {
                    if (!isCurrent() || !button.isConnected) stopPlayback();
                    else update(button);
                }
            } catch (error) {
                if (current !== selection) return;
                if (playing) qqFailureLog.record(qqFailureLog.begin({ source: '正文朗读', kind: 'tts', scopeId: getQQV2RuntimeStatus().scopeId }), error);
                stopPlayback(); showNotification(error.message || '正文朗读失败，请再次点击重试', 'error');
            }
        },
    };
}
