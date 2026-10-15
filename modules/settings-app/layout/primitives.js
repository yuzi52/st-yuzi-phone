import { t } from '../../i18n/index.js';
import {
    buildPhoneBackButton,
    buildPhoneNavBar,
    buildPhoneNavTitleSwitcher,
} from '../../phone-core/navigation-ui.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';

export const SETTINGS_ENTRY_META = {
    body_dialogue: { glyph: '言', title: '正文对话气泡', description: '正文美化、人物与朗读', tone: 'is-appearance' },
    tts: { glyph: 'TTS', title: 'TTS', get description() { return t("连接、音色仓库与试听"); }, tone: 'is-api' },
    input_shortcuts: { get glyph() { return t("键"); }, get title() { return t("输入快捷键"); }, get description() { return t("自定义酒馆输入框快捷键"); }, tone: 'is-button' },
    logs: { get glyph() { return t("志"); }, get title() { return t("日志"); }, get description() { return t("当前聊天的 QQ 失败记录"); }, tone: 'is-api' },
    appearance: {
        get glyph() { return t("界"); },
        get title() { return t("界面外观"); },
        get description() { return t("背景、图标布局与显示细节"); },
        tone: 'is-appearance',
        get badge() { return t("桌面"); },
    },
    beautify: {
        get glyph() { return t("模"); },
        get title() { return t("模板工坊"); },
        get description() { return t("管理小剧场与通用表格模板"); },
        tone: 'is-beautify',
        get badge() { return t("模板"); },
    },
    button_style: {
        get glyph() { return t("控"); },
        get title() { return t("控件与按钮"); },
        get description() { return t("管理悬浮入口显示、位置、尺寸、形态与封面"); },
        tone: 'is-button',
        get badge() { return t("交互"); },
    },
    worldbook_reading: {
        get glyph() { return t("书"); },
        get title() { return t("读取世界书"); },
        get description() { return t("管理 QQ 提示词允许读取的角色世界书条目"); },
        tone: 'is-worldbook',
        get badge() { return t("上下文"); },
    },
    image_generation: {
        get glyph() { return t("绘"); },
        get title() { return t("生图设置"); },
        get description() { return t("配置生图接口、角色资料映射与测试生成"); },
        tone: 'is-image-generation',
        get badge() { return t("图片"); },
    },
    api_presets: {
        glyph: 'API',
        get title() { return t("API 预设"); },
        get description() { return t("管理 QQ 使用的接口、模型与生成参数"); },
        tone: 'is-api',
        get badge() { return t("接口"); },
    },
    ai_instruction_presets: {
        get glyph() { return t("令"); },
        get title() { return t("AI 指令预设"); },
        get description() { return t("管理 QQ 聊天回复与主动消息的分段提示词"); },
        tone: 'is-ai',
        get badge() { return t("提示词"); },
    },
    table_content_replacement: {
        get glyph() { return t("换"); },
        get title() { return t("表格内容词汇替换"); },
        get description() { return t("按全局或单表规则批量替换普通文字"); },
        tone: 'is-table-content-replacement',
        get badge() { return t("表格"); },
    },
    fullscreen_overlay: {
        get glyph() { return t("幕"); },
        get title() { return t("弹幕设置"); },
        get description() { return t("管理表格内容的全屏浮层展示"); },
        tone: 'is-fullscreen-overlay',
        get badge() { return t("浮层"); },
    },
};

export function buildSettingsChipHtml(text, tone = 'neutral') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'neutral').trim();
    return `<span class="phone-settings-chip${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

export function buildSettingsBadgeHtml(text, tone = 'soft') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'soft').trim();
    return `<span class="phone-settings-badge${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

export function buildSettingsHeroHtml({ eyebrow = '', title = '', description = '', chips = [], statsHtml = '', asideHtml = '' }) {
    const chipsHtml = Array.isArray(chips)
        ? chips.map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return buildSettingsChipHtml(item, 'neutral');
            return buildSettingsChipHtml(item.text, item.tone || 'neutral');
        }).join('')
        : '';

    return `
        <section class="phone-settings-hero">
            <div class="phone-settings-hero-main">
                ${eyebrow ? `<span class="phone-settings-hero-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
                <h2 class="phone-settings-hero-title">${escapeHtml(title)}</h2>
                ${description ? `<p class="phone-settings-hero-description">${escapeHtml(description)}</p>` : ''}
                ${chipsHtml ? `<div class="phone-settings-hero-chips">${chipsHtml}</div>` : ''}
                ${statsHtml || asideHtml ? `<div class="phone-settings-hero-extend">${statsHtml || ''}${asideHtml || ''}</div>` : ''}
            </div>
        </section>
    `;
}

export function buildSettingsStatGridHtml(items = []) {
    const validItems = Array.isArray(items)
        ? items.filter((item) => item && (item.label || item.value || item.note))
        : [];

    if (validItems.length === 0) return '';

    return `
        <div class="phone-settings-stat-grid">
            ${validItems.map((item) => `
                <div class="phone-settings-stat-card">
                    <span class="phone-settings-stat-label">${escapeHtml(item.label || '')}</span>
                    <strong class="phone-settings-stat-value">${escapeHtml(item.value || '')}</strong>
                    ${item.note ? `<span class="phone-settings-stat-note">${escapeHtml(item.note)}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

export function buildSettingsSummaryListHtml(items = []) {
    const validItems = Array.isArray(items)
        ? items.filter((item) => item && (item.label || item.value))
        : [];

    if (validItems.length === 0) return '';

    return `
        <div class="phone-settings-summary-list">
            ${validItems.map((item) => `
                <div class="phone-settings-summary-item">
                    <span class="phone-settings-summary-label">${escapeHtml(item.label || '')}</span>
                    <span class="phone-settings-summary-value">${escapeHtml(item.value || '')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

export function buildSettingsSectionHtml({ id = '', title = '', desc = '', actionsHtml = '', bodyHtml = '', extraClass = '' }) {
    const resolvedId = String(id || '').trim();
    const resolvedExtraClass = String(extraClass || '').trim();

    return `
        <section class="phone-settings-section${resolvedExtraClass ? ` ${escapeHtmlAttr(resolvedExtraClass)}` : ''}" ${resolvedId ? `id="${escapeHtmlAttr(resolvedId)}"` : ''}>
            <div class="phone-settings-section-head">
                <div class="phone-settings-section-heading">
                    <span class="phone-settings-section-title">${escapeHtml(title)}</span>
                    ${desc ? `<p class="phone-settings-section-subtitle">${escapeHtml(desc)}</p>` : ''}
                </div>
                ${actionsHtml ? `<div class="phone-settings-section-side">${actionsHtml}</div>` : ''}
            </div>
            <div class="phone-settings-section-body">
                ${bodyHtml || ''}
            </div>
        </section>
    `;
}

export function buildSettingsPageFrame({
    title,
    bodyClass = 'phone-app-body phone-settings-scroll',
    bodyHtml = '',
    rightActionHtml = '',
    heroHtml = '',
}) {
    const resolvedBodyClass = String(bodyClass || 'phone-app-body phone-settings-scroll').trim() || 'phone-app-body phone-settings-scroll';
    const navigationHtml = buildPhoneNavBar({
        leadingHtml: buildPhoneBackButton(),
        centerHtml: buildPhoneNavTitleSwitcher({ title }),
        trailingHtml: rightActionHtml
            ? `<div class="phone-settings-nav-side">${rightActionHtml}</div>`
            : '',
    });
    return `
        <div class="phone-app-page phone-settings-page">
            ${navigationHtml}
            <div class="${resolvedBodyClass}">
                <div class="phone-settings-page-stack">
                    ${heroHtml || ''}
                    ${bodyHtml || ''}
                </div>
            </div>
        </div>
    `;
}

export function buildSettingsHomeItemHtml({ entry, title, description = '', quickHtml = '', badge = '', tags = [], toneClass = '', variant = 'rich' }) {
    if (variant === 'profile-action') {
        return `
            <div class="phone-settings-profile-action-item">
                <button type="button" class="phone-settings-home-trigger phone-settings-profile-action-trigger" data-entry="${escapeHtmlAttr(entry || '')}">
                    <span class="phone-settings-profile-action-title">${escapeHtml(title || '')}</span>
                    <span class="phone-settings-profile-action-chevron" aria-hidden="true">›</span>
                </button>
            </div>
        `;
    }

    const entryMeta = SETTINGS_ENTRY_META[entry] || {};
    const resolvedToneClass = String(toneClass || entryMeta.tone || '').trim();
    const resolvedGlyph = String(entryMeta.glyph || title || t("设")).trim();
    const tagsHtml = Array.isArray(tags)
        ? tags.map((tag) => {
            if (!tag) return '';
            if (typeof tag === 'string') return buildSettingsChipHtml(tag, 'soft');
            return buildSettingsChipHtml(tag.text, tag.tone || 'soft');
        }).join('')
        : '';

    return `
        <article class="phone-settings-home-item${resolvedToneClass ? ` ${escapeHtmlAttr(resolvedToneClass)}` : ''}">
            <button type="button" class="phone-settings-home-trigger" data-entry="${escapeHtmlAttr(entry || '')}">
                <span class="phone-settings-home-icon"><span class="phone-settings-home-glyph">${escapeHtml(resolvedGlyph)}</span></span>
                <span class="phone-settings-home-main">
                    <span class="phone-settings-home-heading">
                        <span class="phone-settings-home-title">${escapeHtml(title || '')}</span>
                        ${badge ? buildSettingsBadgeHtml(badge, 'soft') : ''}
                    </span>
                    ${description ? `<span class="phone-settings-home-desc">${escapeHtml(description)}</span>` : ''}
                    ${tagsHtml ? `<span class="phone-settings-home-meta">${tagsHtml}</span>` : ''}
                </span>
                <span class="phone-settings-home-side">
                    <span class="phone-settings-home-arrow">›</span>
                </span>
            </button>
            ${quickHtml ? `<div class="phone-settings-home-extra">${quickHtml}</div>` : ''}
        </article>
    `;
}
