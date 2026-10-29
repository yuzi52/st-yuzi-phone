import { buildPhoneBackButton, buildPhoneSwitchButton, buildPhoneNavTitleSwitcher, buildPhoneNavBar } from '../../phone-core/navigation-ui.js';
import { PHONE_ICONS } from '../../phone-home/icons.js';

/** Built-in pages retain their actions, but share the phone's navigation geometry. */
export function buildBuiltinTheaterNav(sceneId, title) {
    const switchButton = (direction, action, suffix, label) => buildPhoneSwitchButton(direction, {
        action, label, attributes: { id: `yuzi-theater-${sceneId}-${suffix}` },
    });
    return buildPhoneNavBar({
        className: 'yuzi-phone-theater-nav',
        leadingHtml: buildPhoneBackButton({ action: 'back', label: '返回上一层' }),
        centerHtml: buildPhoneNavTitleSwitcher({
            title,
            previousHtml: switchButton('previous', 'previousTable', 'prev', '上一张表'),
            nextHtml: switchButton('next', 'nextTable', 'next', '下一张表'),
        }),
        trailingHtml: `<button type="button" class="phone-nav-icon-button" data-action="editCurrentTable" aria-label="编辑当前表" title="编辑当前表">${PHONE_ICONS.edit}</button>`,
    });
}
