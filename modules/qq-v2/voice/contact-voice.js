/** A contact carries its own voice; ordinary selections keep using the shared library. */
export function normalizeQQContactVoice(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const voiceId = String(value.voiceId ?? '').trim().slice(0, 256);
    if (!voiceId) return null;
    return {
        voiceId,
        name: String(value.name ?? '').trim().slice(0, 256) || voiceId,
    };
}

/** Both the chat readiness check and synthesis use this same selection. */
export function resolveQQProfileVoice(profile, entries = []) {
    const voice = normalizeQQContactVoice(profile?.voice);
    if (voice) return voice;
    const voiceId = String(profile?.voiceId ?? '').trim().slice(0, 256);
    if (!voiceId) return null;
    return normalizeQQContactVoice(entries.find(entry => entry.voiceId === voiceId));
}
