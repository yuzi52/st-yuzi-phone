import { CONTENT_PRESET_DISPLAY_SOURCE_ID } from '../../content-presets/display-directory.js';

function text(value) {
    return String(value ?? '').trim();
}

function targetTables(context, snapshot = true) {
    const display = context?.customDisplay;
    const rawData = context?.rawData || context?.snapshot || {};
    const sheetKeys = Array.isArray(display?.targetSheetKeys)
        ? display.targetSheetKeys.map(text).filter(Boolean)
        : [];
    if (!display || sheetKeys.length === 0) return [];
    return sheetKeys.map(sheetKey => {
        const sheet = rawData?.[sheetKey];
        const content = Array.isArray(sheet?.content) ? sheet.content : [];
        const table = {
            sheetKey,
            tableName: text(sheet?.name) || sheetKey,
            headers: Array.isArray(content[0]) ? content[0] : [],
            rows: content.slice(1).filter(Array.isArray),
        };
        if (!snapshot) return table;
        table.headers = Object.freeze([...table.headers]);
        table.rows = Object.freeze(table.rows.map(row => Object.freeze([...row])));
        return Object.freeze(table);
    });
}

export function createContentPresetDisplaySourceAdapter() {
    return Object.freeze({
        id: CONTENT_PRESET_DISPLAY_SOURCE_ID,
        modelId: CONTENT_PRESET_DISPLAY_SOURCE_ID,
        modelIds: Object.freeze([]),
        defaultEnabled: true,
        matches(context) {
            return text(context?.sourceId || context?.sourceKind) === CONTENT_PRESET_DISPLAY_SOURCE_ID
                && !!context?.customDisplay;
        },
        getSignature(context) {
            const display = context?.customDisplay;
            if (!display) return '';
            return JSON.stringify([
                text(display.modelId),
                targetTables(context, false).map(table => [
                    table.sheetKey,
                    table.tableName,
                    table.headers,
                    table.rows,
                ]),
            ]);
        },
        readEvents(context) {
            const display = context?.customDisplay;
            const tables = targetTables(context);
            if (!display || tables.length === 0) return Object.freeze([]);
            return Object.freeze([Object.freeze({
                sourceId: CONTENT_PRESET_DISPLAY_SOURCE_ID,
                customDisplay: display,
                tables,
            })]);
        },
    });
}
