import { t } from '../i18n/index.js';
import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import { PHONE_ICONS } from '../phone-home/icons.js';
import {
    buildPhoneBackButton,
    buildPhoneNavBar,
    buildPhoneNavTitleSwitcher,
    buildPhoneSwitchButton,
} from '../phone-core/navigation-ui.js';
import { theaterRenderKit } from './core/render-kit.js';

function renderEditMenu(editableTables = []) {
    const entries = editableTables.filter(entry => entry?.available);
    if (entries.length <= 1) return '';
    return `
        <div class="phone-theater-edit-menu" role="menu">
            ${entries.map((entry) => `
                <button type="button" class="phone-theater-edit-menu-item" data-action="theater-open-edit-table" data-edit-role="${escapeHtmlAttr(entry.role)}" role="menuitem">
                    <span>${escapeHtml(entry.label || entry.tableName || t("编辑表格"))}</span>
                    ${entry.description ? `<small>${escapeHtml(entry.description)}</small>` : ''}
                </button>
            `).join('')}
        </div>
    `;
}

function renderTitleNavigation(title, navigation) {
    if (!navigation?.currentSheetKey) {
        return buildPhoneNavTitleSwitcher({
            title: title || '小剧场',
            className: 'phone-theater-title-navigation is-title-only',
        });
    }
    const previous = navigation.previous || {};
    const next = navigation.next || {};
    return buildPhoneNavTitleSwitcher({
        title: title || '小剧场',
        previousHtml: buildPhoneSwitchButton('previous', {
            className: 'phone-theater-table-navigation-button',
            action: 'theater-table-navigation-previous',
            label: t("上一张表"),
            disabled: previous.disabled === true,
            attributes: { 'aria-disabled': previous.disabled ? 'true' : 'false' },
        }),
        nextHtml: buildPhoneSwitchButton('next', {
            className: 'phone-theater-table-navigation-button',
            action: 'theater-table-navigation-next',
            label: t("下一张表"),
            disabled: next.disabled === true,
            attributes: { 'aria-disabled': next.disabled ? 'true' : 'false' },
        }),
        className: 'phone-theater-title-navigation phone-theater-table-navigation',
        attributes: { 'aria-label': t("切换表格") },
    });
}

function renderNavActions(uiState = {}) {
    const deleteMode = !!uiState.deleteManageMode;
    const deleting = !!uiState.deleting;
    const editableTables = Array.isArray(uiState.editableTables) ? uiState.editableTables : [];
    const canEdit = !!uiState.canEdit;
    const canDelete = !!uiState.canDelete;
    const editMenuOpen = !!uiState.editMenuOpen;
    const availableEditableTables = editableTables.filter(entry => entry?.available);
    const hasEditMenu = availableEditableTables.length > 1;
    const editButtonLabel = hasEditMenu
        ? (editMenuOpen ? t("收起编辑表格菜单") : t("选择要编辑的表格"))
        : (availableEditableTables[0]?.label || t("编辑当前表"));

    if (!canEdit && !canDelete) return '<div class="phone-theater-nav-actions" aria-hidden="true"></div>';

    return `
        <div class="phone-nav-inline-actions phone-theater-nav-actions">
            ${canEdit ? `
                <div class="phone-theater-edit-wrapper ${editMenuOpen ? 'is-open' : ''}">
                    <button type="button" class="phone-nav-icon-button phone-theater-edit-toggle" data-action="toggle-theater-edit-menu" aria-label="${escapeHtmlAttr(editButtonLabel)}" title="${escapeHtmlAttr(editButtonLabel)}"${hasEditMenu ? ` aria-haspopup="menu" aria-expanded="${editMenuOpen ? 'true' : 'false'}"` : ''}>${PHONE_ICONS.edit}</button>
                    ${editMenuOpen ? renderEditMenu(editableTables) : ''}
                </div>
            ` : ''}
            ${canDelete ? `<button type="button" class="phone-theater-delete-toggle ${deleteMode ? 'is-active' : ''}" data-action="toggle-theater-delete-mode" ${deleting ? 'disabled' : ''}>${deleteMode ? t("完成") : t("删除")}</button>` : ''}
        </div>
    `;
}

function renderNav(title, uiState = {}) {
    return buildPhoneNavBar({
        className: `phone-theater-nav ${uiState.canDelete ? 'has-inline-actions' : ''}`,
        leadingHtml: buildPhoneBackButton(),
        centerHtml: renderTitleNavigation(title, uiState.tableNavigation),
        trailingHtml: renderNavActions(uiState),
    });
}

function renderDeleteManageBar(uiState = {}) {
    if (!uiState.deleteManageMode) return '';
    const selectedCount = Number(uiState.selectedCount || 0);
    const totalCount = Number(uiState.totalCount || 0);
    const deleting = !!uiState.deleting;
    return `
        <div class="phone-theater-manage-bar">
            <button type="button" class="phone-theater-manage-btn" data-action="theater-select-all" ${deleting || totalCount <= 0 ? 'disabled' : ''}>${t`全选`}</button>
            <button type="button" class="phone-theater-manage-btn" data-action="theater-clear-selection" ${deleting || selectedCount <= 0 ? 'disabled' : ''}>${t`取消选择`}</button>
            <button type="button" class="phone-theater-manage-btn is-danger" data-action="theater-confirm-delete" ${deleting || selectedCount <= 0 ? 'disabled' : ''}>${deleting ? t("删除中...") : t`删除已选（${selectedCount}）`}</button>
        </div>
    `;
}

function renderSceneContent(viewModel, uiState = {}) {
    if (!viewModel?.available) return theaterRenderKit.renderEmpty(viewModel?.emptyText || t("暂无内容"));
    const renderContent = viewModel?.scene?.renderContent;
    if (typeof renderContent !== 'function') return theaterRenderKit.renderEmpty(t("未知小剧场入口"));
    return renderContent(viewModel, uiState, theaterRenderKit);
}

export function buildTheaterScenePageHtml(viewModel, uiState = {}) {
    const title = viewModel?.title || '小剧场';
    const sceneId = viewModel?.scene?.id || '';
    const styleScope = viewModel?.scene?.styleScope || sceneId;
    return `
        <div class="phone-app-page phone-theater-page ${uiState.deleteManageMode ? 'is-theater-delete-mode' : ''}" data-theater-scene="${escapeHtmlAttr(sceneId)}" data-theater-style-scope="${escapeHtmlAttr(styleScope)}">
            ${renderNav(title, uiState)}
            <div class="phone-app-body phone-theater-body">
                ${renderDeleteManageBar(uiState)}
                ${renderSceneContent(viewModel, uiState)}
            </div>
        </div>
    `;
}
