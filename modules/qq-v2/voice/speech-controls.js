export const QQ_VOICE_SPEECH_DEFAULTS = Object.freeze({ speed: 1, temperature: 0.7 });

/** Keep Fish request validation and dialogue-cache identities on the same values. */
export function normalizeQQVoiceSpeechControls(value = {}) {
    const within = (number, min, max, fallback) => typeof number === 'number' && Number.isFinite(number)
        && number >= min && number <= max ? number : fallback;
    return {
        speed: within(value?.speed, 0.5, 2, QQ_VOICE_SPEECH_DEFAULTS.speed),
        temperature: within(value?.temperature, 0, 1, QQ_VOICE_SPEECH_DEFAULTS.temperature),
    };
}
