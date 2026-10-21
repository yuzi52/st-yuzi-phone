import { t } from '../i18n/index.js';
import { PHONE_ICONS } from './icons.js';

export function getHomeDockApps() {
    return [
        { id: 'settings', name: t("设置"), icon: PHONE_ICONS.gear, route: 'settings' },
        {
            id: 'visualizer',
            name: t("可视化"),
            icon: PHONE_ICONS.visualizer,
            action: 'invoke',
            pendingMessage: t("正在打开可视化编辑器..."),
        },
        {
            id: 'db_settings',
            name: t("数据库"),
            icon: PHONE_ICONS.database,
            action: 'invoke',
            pendingMessage: t("正在打开数据库界面..."),
        },
        { id: 'fusion', name: t("缝合"), icon: PHONE_ICONS.puzzle, route: 'fusion' },
    ];
}

export function normalizeHiddenTableApps(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (!key) return;
        if (value) map[key] = true;
    });
    return map;
}

export function formatTableCountBadge(totalCount) {
    const safeCount = Number.isFinite(Number(totalCount))
        ? Math.max(0, Math.floor(Number(totalCount)))
        : 0;

    if (safeCount <= 0) return '';
    if (safeCount >= 100) return '99+';
    return String(safeCount);
}

export function getSheetRowCount(sheet) {
    if (!sheet?.content || !Array.isArray(sheet.content)) return 0;
    return Math.max(0, sheet.content.length - 1);
}
