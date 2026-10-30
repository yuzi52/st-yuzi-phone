import { normalizeQQVoiceVolume } from './speech-controls.js';

/** A portable voice retains its volume when the shared library has no matching ID. */
export function normalizeQQContactVoice(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const voiceId = String(value.voiceId ?? '').trim().slice(0, 256);
    if (!voiceId) return null;
    return {
        voiceId,
        name: String(value.name ?? '').trim().slice(0, 256) || voiceId,
        volume: normalizeQQVoiceVolume(value.volume),
    };
}

/** Both the chat readiness check and synthesis use this same selection. */
export function resolveQQProfileVoice(profile, entries = []) {
    const voice = normalizeQQContactVoice(profile?.voice);
    const voiceId = voice?.voiceId || String(profile?.voiceId ?? '').trim().slice(0, 256);
    if (!voiceId) return null;
    const entry = entries.find(item => item.voiceId === voiceId);
    return voice
        ? { ...voice, volume: normalizeQQVoiceVolume(entry ? entry.volume : voice.volume) }
        : normalizeQQContactVoice(entry);
}
