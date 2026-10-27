const BOTTOM_VISUALIZATION_SETTING_KEYS = new Set([
    'bottomVisualization',
    'bottomVisualizationNavImage',
    'bottomVisualizationPanelImage',
    'phoneThemeMode',
    'appearanceFontLibrary',
    'phoneReadableTextScalePercent',
    'phoneLanguage',
]);

// 主面板与设置弹窗共用；没有 key 的初始化、恢复和整体重置仍需刷新。
export function isBottomVisualizationSetting(key) {
    return !key || BOTTOM_VISUALIZATION_SETTING_KEYS.has(key);
}

// 只保存此视图的布局和排序；主题、字体和字号的唯一来源仍是主设置。
export function normalizeBottomVisualization(value) {
    const source = value && typeof value === 'object' ? value : {};
    const choice = (key, values, fallback) => values.includes(source[key]) ? source[key] : fallback;
    const number = (key, fallback, min, max, step = 1) => {
        const n = typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback;
        return Math.max(min, Math.min(max, Math.round(n / step) * step));
    };
    return {
        enabled: source.enabled === true,
        layout: choice('layout', ['horizontal', 'vertical'], 'vertical'),
        position: choice('position', ['flow', 'fixed', 'edge'], 'flow'),
        optionsEnabled: source.optionsEnabled === true,
        desktopNav: choice('desktopNav', ['compact', 'aligned'], 'compact'),
        cardWidth: number('cardWidth', 260, 200, 500, 10),
        region: choice('region', ['chat', 'viewport', 'side'], 'chat'),
        side: choice('side', ['left', 'right'], 'right'),
        edgeSide: choice('edgeSide', ['left', 'right'], 'right'),
        opacity: number('opacity', 100, 20, 100, 5),
        height: number('height', 60, 25, 85),
        sortDescendingBySheet: Object.fromEntries(Object.entries(
            source.sortDescendingBySheet && typeof source.sortDescendingBySheet === 'object' && !Array.isArray(source.sortDescendingBySheet)
                ? source.sortDescendingBySheet : {},
        ).filter(([key, value]) => key.startsWith('sheet_') && typeof value === 'boolean')),
    };
}
