export const FUSION_CONFLICT_TYPES = Object.freeze({
    SHEET_KEY: 'sheetKey',
    NAME: 'name',
    BOTH: 'both',
});

export const FUSION_CONFLICT_STRATEGIES = Object.freeze({
    REPLACE: 'replace',
    KEEP_BOTH: 'keepBoth',
    RENAME: 'rename',
});

function cloneJsonValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function sanitizeSheetKeyPart(value) {
    const normalized = String(value || 'sheet')
        .trim()
        .replace(/^sheet_/, '')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'sheet';
}

function ensureSheetKey(value) {
    const text = String(value || '').trim();
    if (text.startsWith('sheet_')) return text;
    return `sheet_${sanitizeSheetKeyPart(text)}`;
}

function createUniqueSheetKey(preferredKey, usedKeys) {
    const baseKey = ensureSheetKey(preferredKey);
    if (!usedKeys.has(baseKey)) return baseKey;
    let index = 2;
    let candidate = `${baseKey}_${index}`;
    while (usedKeys.has(candidate)) {
        index += 1;
        candidate = `${baseKey}_${index}`;
    }
    return candidate;
}

function normalizeSourceEntry(entry, index) {
    const source = entry?.source ?? entry;
    const origin = entry?.origin ?? source?.type ?? `source-${index + 1}`;
    return {
        origin,
        source,
        sourceId: source?.id ?? origin,
        sourceName: source?.name ?? origin,
    };
}

function detectConflictType(item, keyCounts, nameCounts, keyNameCounts) {
    // Map groups NaN keys together, while the original strict comparisons never match them.
    const hasMatchingKey = !Number.isNaN(item.originSheetKey) && keyCounts.get(item.originSheetKey) > 1;
    const hasMatchingName = !Number.isNaN(item.outputName) && nameCounts.get(item.outputName) > 1;
    if (hasMatchingKey && hasMatchingName && keyNameCounts.get(item.originSheetKey)?.get(item.outputName) > 1) {
        return FUSION_CONFLICT_TYPES.BOTH;
    }
    if (hasMatchingKey) {
        return FUSION_CONFLICT_TYPES.SHEET_KEY;
    }
    if (hasMatchingName) {
        return FUSION_CONFLICT_TYPES.NAME;
    }
    return '';
}

function createConflictGroupKey(item, conflictType) {
    if (conflictType === FUSION_CONFLICT_TYPES.BOTH) {
        return `both:${item.originSheetKey}:${item.outputName}`;
    }
    if (conflictType === FUSION_CONFLICT_TYPES.SHEET_KEY) {
        return `key:${item.originSheetKey}`;
    }
    if (conflictType === FUSION_CONFLICT_TYPES.NAME) {
        return `name:${item.outputName}`;
    }
    return item.id;
}


function applySelectionOverride(item, override = {}) {
    return {
        ...item,
        selected: typeof override.selected === 'boolean' ? override.selected : item.selected,
        outputSheetKey: override.outputSheetKey ? ensureSheetKey(override.outputSheetKey) : item.outputSheetKey,
        outputName: typeof override.outputName === 'string' && override.outputName.trim()
            ? override.outputName.trim()
            : item.outputName,
        conflictStrategy: override.conflictStrategy ?? item.conflictStrategy,
    };
}

export function buildFusionSelectionModel(sourceEntries, options = {}) {
    const overrides = options.overrides ?? {};
    const entries = Array.isArray(sourceEntries) ? sourceEntries.map(normalizeSourceEntry) : [];
    const items = [];

    entries.forEach((entry) => {
        const validSheets = Array.isArray(entry.source?.sheets)
            ? entry.source.sheets.filter((sheet) => sheet.valid)
            : [];
        validSheets.forEach((sheet) => {
            items.push({
                id: `${entry.origin}:${sheet.key}`,
                origin: entry.origin,
                originSourceId: entry.sourceId,
                originSourceName: entry.sourceName,
                originSheetKey: sheet.key,
                outputSheetKey: ensureSheetKey(sheet.key),
                outputName: sheet.name,
                selected: true,
                conflictType: '',
                conflictStrategy: FUSION_CONFLICT_STRATEGIES.KEEP_BOTH,
                sheet: cloneJsonValue(sheet.sheet),
            });
        });
    });

    const keyCounts = new Map();
    const nameCounts = new Map();
    const keyNameCounts = new Map();
    items.forEach(({ originSheetKey, outputName }) => {
        keyCounts.set(originSheetKey, (keyCounts.get(originSheetKey) || 0) + 1);
        nameCounts.set(outputName, (nameCounts.get(outputName) || 0) + 1);
        const namesForKey = keyNameCounts.get(originSheetKey) || new Map();
        namesForKey.set(outputName, (namesForKey.get(outputName) || 0) + 1);
        keyNameCounts.set(originSheetKey, namesForKey);
    });

    const conflictGroupFirstIds = new Map();
    const withConflicts = items.map((item) => {
        const conflictType = detectConflictType(item, keyCounts, nameCounts, keyNameCounts);
        const conflictKey = createConflictGroupKey(item, conflictType);
        const isFirstConflictItem = !conflictType || !conflictGroupFirstIds.has(conflictKey);
        if (conflictType && isFirstConflictItem) conflictGroupFirstIds.set(conflictKey, item.id);
        const baseItem = {
            ...item,
            selected: !conflictType || isFirstConflictItem,
            conflictType,
            conflictStrategy: conflictType
                ? FUSION_CONFLICT_STRATEGIES.REPLACE
                : FUSION_CONFLICT_STRATEGIES.KEEP_BOTH,
        };
        return applySelectionOverride(baseItem, overrides[baseItem.id]);
    });

    return withConflicts;
}

function createFusionMeta(selectionItems, generatedAt) {
    const selectedItems = selectionItems.filter((item) => item.selected);
    const sourceMap = new Map();
    selectedItems.forEach((item) => {
        const current = sourceMap.get(item.origin) ?? {
            origin: item.origin,
            sourceId: item.originSourceId,
            name: item.originSourceName,
            sheetCount: 0,
            sheets: [],
        };
        current.sheetCount += 1;
        current.sheets.push({
            key: item.originSheetKey,
            outputSheetKey: item.finalOutputSheetKey ?? item.outputSheetKey,
            name: item.finalOutputName ?? item.outputName,
        });
        sourceMap.set(item.origin, current);
    });
    return {
        generatedBy: 'yuzi-phone-fusion',
        generatedAt,
        sources: Array.from(sourceMap.values()),
    };
}

function resolveOutputKey(item, usedKeys) {
    if (item.conflictStrategy === FUSION_CONFLICT_STRATEGIES.KEEP_BOTH) {
        return createUniqueSheetKey(item.outputSheetKey, usedKeys);
    }
    if (item.conflictStrategy === FUSION_CONFLICT_STRATEGIES.RENAME) {
        return createUniqueSheetKey(item.outputSheetKey || item.outputName, usedKeys);
    }
    return ensureSheetKey(item.outputSheetKey);
}

export function buildMergedFusionTemplate(selectionItems, options = {}) {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const items = Array.isArray(selectionItems) ? selectionItems : [];
    const selectedItems = items.filter((item) => item?.selected && item?.sheet);
    const usedKeys = new Set();
    const outputItemsByKey = new Map();
    selectedItems.forEach((item) => {
        const finalOutputSheetKey = resolveOutputKey(item, usedKeys);
        usedKeys.add(finalOutputSheetKey);
        outputItemsByKey.set(finalOutputSheetKey, {
            ...item,
            finalOutputSheetKey,
            finalOutputName: item.outputName,
        });
    });
    const outputItems = Array.from(outputItemsByKey.values()).map((item, index) => ({
        ...item,
        finalOrderNo: index,
    }));
    const merged = {
        mate: {
            type: 'chatSheets',
            version: 1,
            fusionMeta: createFusionMeta(outputItems, generatedAt),
        },
    };

    outputItems.forEach((item) => {
        const outputKey = item.finalOutputSheetKey;
        const sheet = cloneJsonValue(item.sheet);
        sheet.name = item.finalOutputName;
        sheet.orderNo = item.finalOrderNo;
        merged[outputKey] = sheet;
    });

    return merged;
}

export function buildFusionMergeResult(sourceEntries, options = {}) {
    const selectionModel = buildFusionSelectionModel(sourceEntries, options);
    return {
        selectionModel,
        mergedTemplate: buildMergedFusionTemplate(selectionModel, options),
    };
}
