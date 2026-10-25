import { t } from '../i18n/index.js';
import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import { buildDetailEditControlHtml } from './detail-edit-field.js';
import { PHONE_ICONS } from '../phone-home/icons.js';
import {
    buildPhoneBackButton,
    buildPhoneNavBar,
    buildPhoneNavTitleSwitcher,
    buildPhoneSwitchButton,
} from '../phone-core/navigation-ui.js';

export function buildGenericDetailPageHtml(options = {}) {
    const {
        title = '',
        kvPairs = [],
        rowLocked = false,
        pagerInfo = {},
        genericStylePayload,
        state,
    } = options;

    const pagerDisabled = !!pagerInfo.disabled;
    const prevIndex = Number.isInteger(pagerInfo.prevIndex) ? pagerInfo.prevIndex : -1;
    const nextIndex = Number.isInteger(pagerInfo.nextIndex) ? pagerInfo.nextIndex : -1;
    const navHtml = buildPhoneNavBar({
        className: `phone-generic-slot-nav${state.editMode ? ' has-inline-actions' : ''}`,
        leadingHtml: buildPhoneBackButton({ action: 'detail-back', disabled: state.saving }),
        centerHtml: buildPhoneNavTitleSwitcher({ title }),
        trailingHtml: state.editMode
            ? `<div class="phone-nav-inline-actions phone-generic-detail-edit-actions">
                    <button type="button" class="phone-nav-icon-button" id="phone-toggle-edit-mode" title="${t("取消")}" aria-label="${t("取消")}" ${state.saving ? 'disabled' : ''}>${PHONE_ICONS.editCancel}</button>
                    <button type="button" class="phone-nav-icon-button is-primary" id="phone-save-row" title="${t("保存")}" aria-label="${t("保存")}" aria-busy="${state.saving ? 'true' : 'false'}" ${rowLocked || state.saving ? 'disabled' : ''}>${PHONE_ICONS.editSave}</button>
                </div>`
            : state.cellLockManageMode
                ? `<button type="button" class="phone-nav-icon-button phone-generic-manage-done" id="phone-cell-lock-mode-btn">${t("完成")}</button>`
                : `<button type="button" class="phone-nav-icon-button phone-generic-manage-menu" data-action="detail-management" aria-label="${t("字段锁定")}" aria-haspopup="dialog" title="${t("字段锁定")}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>`,
    });
    const previousHtml = buildPhoneSwitchButton('previous', {
        className: 'phone-detail-pager-btn',
        label: t("上一条"),
        disabled: pagerDisabled,
        attributes: {
            'data-pager': 'prev',
            'data-target-row-index': String(prevIndex),
            'aria-disabled': pagerDisabled ? 'true' : 'false',
        },
    });
    const nextHtml = buildPhoneSwitchButton('next', {
        className: 'phone-detail-pager-btn',
        label: t("下一条"),
        disabled: pagerDisabled,
        attributes: {
            'data-pager': 'next',
            'data-target-row-index': String(nextIndex),
            'aria-disabled': pagerDisabled ? 'true' : 'false',
        },
    });

    return `
        <div class="phone-app-page phone-generic-root phone-generic-detail-root ${genericStylePayload.className}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
            ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
            ${navHtml}
            <div class="phone-app-body phone-table-body phone-generic-slot-body">
                <div class="phone-generic-detail-page phone-generic-detail-page-flow">
                    <div class="phone-row-detail-card phone-generic-slot-detail phone-generic-detail-flow-list">
                        ${kvPairs.map((pair) => `
                            <div class="phone-row-detail-kv phone-generic-slot-detail-field ${pair.isLocked ? 'is-locked' : ''} ${pair.preferFullRow ? 'is-long-content' : ''} ${state.cellLockManageMode ? 'show-lock-tools' : ''}" data-col-index="${pair.rawColIndex}">
                                <div class="phone-generic-field-header">
                                    <span class="phone-row-detail-key">${escapeHtml(pair.key)}</span>
                                    ${pair.isLocked ? `<span class="phone-generic-field-lock-state">${pair.cellLocked ? t("字段锁定") : t("整行锁定")}</span>` : ''}
                                </div>
                                ${state.editMode
                                    ? buildDetailEditControlHtml(pair)
                                    : `<span class="phone-row-detail-value">${escapeHtml(pair.value || '—')}</span>`
                                }
                                <div class="phone-row-detail-tools phone-generic-slot-detail-tools">
                                    <button type="button" class="phone-cell-lock-btn ${pair.cellLocked ? 'locked' : ''}" data-cell-lock="${pair.lockColIndex}" data-cell-raw="${pair.rawColIndex}" ${rowLocked ? 'disabled' : ''}>${pair.cellLocked ? t("已锁定") : t("锁定")}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="phone-detail-pager-bar phone-generic-slot-pager" aria-label="${t`详情页翻页`}">
                ${previousHtml}
                ${nextHtml}
            </div>
            ${!state.editMode && !state.cellLockManageMode ? `
                <button type="button" class="phone-entry-fab phone-detail-fab phone-generic-slot-actions" id="phone-toggle-edit-mode" aria-label="${t("进入编辑")}" title="${t("进入编辑")}" ${rowLocked ? 'disabled' : ''}>
                    <i class="fa-solid fa-pencil" aria-hidden="true"></i>
                </button>
            ` : ''}
        </div>
    `;
}
