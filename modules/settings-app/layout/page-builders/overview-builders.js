import { getPhoneSettings } from '../../../settings.js';
import { t } from '../../../i18n/index.js';
import { isContentPresetFullPageRuntimeEnabled } from '../../../content-presets/activation-gate.js';
import {
    SETTINGS_ENTRY_META,
    buildSettingsHomeItemHtml,
    buildSettingsPageFrame,
} from '../primitives.js';

export function buildSettingsHomePageHtml({
    contentPresetFullPageRuntimeEnabled = isContentPresetFullPageRuntimeEnabled(),
} = {}) {
    const entries = [
        'appearance',
        ...(contentPresetFullPageRuntimeEnabled ? ['beautify'] : []),
        'button_style',
        'worldbook_reading',
        'image_generation',
        'api_presets',
        'tts',
        'body_dialogue',
        'ai_instruction_presets',
        'table_content_replacement',
        'fullscreen_overlay',
        'input_shortcuts',
        'logs',
    ];
    const remainingEntries = entries.slice(2);
    const groups = contentPresetFullPageRuntimeEnabled
        ? [entries.slice(0, 2), remainingEntries.slice(0, 5), remainingEntries.slice(5)]
        : [entries.slice(0, 1), entries.slice(1, 6), entries.slice(6)];
    const bodyHtml = `
        <div class="phone-settings-profile-action-groups">
            ${groups.filter(group => group.length > 0).map((group, index, all) => `
                <div class="phone-settings-profile-action-group">
                    ${group.map(entry => buildSettingsHomeItemHtml({
                        entry,
                        title: SETTINGS_ENTRY_META[entry].title,
                        variant: 'profile-action',
                    })).join('')}
                    ${index === all.length - 1 ? `<div class="phone-settings-profile-action-trigger yuzi-bottom-enable-row"><span class="phone-settings-profile-action-title">${t('底部可视化')}</span><button type="button" role="switch" id="yuzi-bottom-enabled" class="yuzi-bottom-enable-switch" aria-label="${t('底部可视化')}" aria-checked="${getPhoneSettings().bottomVisualization.enabled}"></button></div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
    return buildSettingsPageFrame({
        title: t("设置"),
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-home-scroll',
        bodyHtml,
    });
}
