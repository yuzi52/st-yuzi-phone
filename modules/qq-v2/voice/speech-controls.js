export const QQ_VOICE_SPEECH_DEFAULTS = Object.freeze({ speed: 1, temperature: 0.7 });
export const QQ_VOICE_VOLUME = Object.freeze({ min: -40, max: 40, step: 1 });

/** One dB value shared by storage, portable voices, requests and cache keys. */
export function normalizeQQVoiceVolume(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(QQ_VOICE_VOLUME.min, Math.min(QQ_VOICE_VOLUME.max, Math.round(value))) : 0;
}

/** Keep Fish request validation and dialogue-cache identities on the same values. */
export function normalizeQQVoiceSpeechControls(value = {}) {
    const within = (number, min, max, fallback) => typeof number === 'number' && Number.isFinite(number)
        && number >= min && number <= max ? number : fallback;
    return {
        speed: within(value?.speed, 0.5, 2, QQ_VOICE_SPEECH_DEFAULTS.speed),
        temperature: within(value?.temperature, 0, 1, QQ_VOICE_SPEECH_DEFAULTS.temperature),
    };
}
