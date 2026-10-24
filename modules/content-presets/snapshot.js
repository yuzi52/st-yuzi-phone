function cloneValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    Object.values(value).forEach(child => deepFreeze(child, seen));
    return value;
}

export function createPresetStateSnapshot(options = {}) {
    const table = createTableSnapshot(options.rawData, options.sheetKey);
    if (!table) return null;
    const navigation = options.navigationState || {};
    const previous = navigation.previous || {};
    const next = navigation.next || {};
    // The table's headers and rows are already isolated and deeply frozen.
    return Object.freeze({
        version: Number.isFinite(options.version) ? options.version :0,
        sheetKey: table.sheetKey,
        tableName: table.tableName,
        headers: table.headers,
        rows: table.rows,
        route: String(options.route || ''),
        canPrevious: previous.disabled !== true && !!previous.target,
        canNext: next.disabled !== true && !!next.target,
    });
}

export function createTableSnapshot(rawData, sheetKey, options = {}) {
    const key = String(sheetKey ?? '').trim();
    const sheet = rawData?.[key];
    if (!key || !sheet || !Array.isArray(sheet.content)) return null;
    const rawHeaders = Array.isArray(sheet.content[0]) ? sheet.content[0] : [];
    const headers = rawHeaders.map((header, index) => String(header ?? '').trim() || `列${index + 1}`);
    const rows = options.includeRows === false ? [] : sheet.content.slice(1).filter(Array.isArray);
    return deepFreeze(cloneValue({
        sheetKey: key,
        tableName: String(sheet.name || key).trim() || key,
        headers,
        rawHeaders,
        rows,
    }));
}
