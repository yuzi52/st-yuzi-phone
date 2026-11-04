import { t } from '../i18n/index.js';
import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../settings.js';
import { getQQAppIcon } from '../phone-home/icons.js';
import { QQ_APP } from '../qq-v2/app-definition.js';
import { subscribeQQV2ProactiveActivity } from '../qq-v2/runtime/default-runtime.js';
import { showToast } from '../settings-app/ui/toast.js';
import { getPhoneCoreState } from './state.js';

/** The shell observes QQ work without owning or cancelling the request. */
export function bindPhoneProactiveIsland(root) {
    const island = root?.querySelector?.('.yuzi-phone-notch');
    if (!island) return () => {};
    const documentRef = island.ownerDocument;
    const icon = documentRef.createElement('span');
    icon.className = 'yuzi-phone-proactive-icon';
    icon.setAttribute('aria-hidden', 'true');
    const dots = documentRef.createElement('span');
    dots.className = 'yuzi-phone-proactive-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) dots.append(documentRef.createElement('span'));
    island.append(icon, dots);
    island.setAttribute('role', 'status');
    island.setAttribute('aria-live', 'polite');

    const updateIcon = () => {
        const html = getQQAppIcon(getPhoneSettings()?.appIcons?.[QQ_APP.id] || '');
        if (icon.innerHTML !== html) icon.innerHTML = html;
    };
    updateIcon();
    const unsubscribeSettings = subscribePhoneSettingsUpdates(({ key }) => {
        if (!key || key === 'appIcons') updateIcon();
    });
    const unsubscribeActivity = subscribeQQV2ProactiveActivity((active, error) => {
        island.classList.toggle('is-proactive', active);
        island.setAttribute('aria-hidden', String(!active));
        if (active) island.setAttribute('aria-label', t("QQ 主动请求进行中"));
        else island.removeAttribute('aria-label');
        if (error && getPhoneCoreState().isPhoneActive) {
            showToast(root.querySelector('.yuzi-phone-shell') || root, t("主动消息生成失败，请查看日志"), true);
        }
    });
    return () => {
        unsubscribeActivity();
        unsubscribeSettings();
        island.classList.remove('is-proactive');
        island.setAttribute('aria-hidden', 'true');
        island.removeAttribute('aria-label');
        island.removeAttribute('role');
        island.removeAttribute('aria-live');
        icon.remove();
        dots.remove();
    };
}
