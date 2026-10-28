import { t } from '../../i18n/index.js';
import { showSettingsOptionSheet } from '../../settings-app/ui/settings-layer.js';
import { normalizeQQContactVoice } from './contact-voice.js';

/** 现有独立音色随联系人保留；改选与清空仍沿用仓库选择流程。 */
export async function pickQQVoice({ facade, value = '', voice = null, runtime, isCurrent = () => true, onSelect }) {
    voice = normalizeQQContactVoice(voice);
    const result = await facade.query.voiceLibrary().catch(error => {
        if (!voice) throw error;
        return null;
    });
    if (!isCurrent()) return;
    if (!result?.ok && !voice) throw new Error(t("读取音色仓库失败"));
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    return showSettingsOptionSheet({
        title: t("角色音色"), runtime, className: 'yuzi-qq-settings-layer',
        groups: [{
            options: [
                { value: '', label: t("未配置"), selected: !voice && !entries.some(entry => entry.voiceId === value) },
                ...(voice ? [{ value: 'contact', label: voice.name, sub: t("随联系人携带"), selected: true }] : []),
                ...entries.map(entry => ({
                    value: `library:${entry.voiceId}`, label: entry.name, selected: !voice && entry.voiceId === value,
                })),
            ],
        }],
        onSelect: next => {
            if (isCurrent() && next !== 'contact') onSelect?.(next.slice(8));
        },
    });
}
