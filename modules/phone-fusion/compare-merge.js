import { t } from '../i18n/index.js';
import {
    buildFusionCompareHtml,
    buildFusionCompareRowHtml,
    buildFusionEmptyResultHtml,
    buildFusionSuccessResultHtml,
} from './templates.js';
import { createLocalJsonSourceModel } from './source-model.js';
import {
    FUSION_CONFLICT_TYPES,
    FUSION_CONFLICT_STRATEGIES,
    buildMergedFusionTemplate,
    buildFusionSelectionModel,
} from './merge-model.js';
import { clearFusionResult, setFusionDownloadUrl } from './runtime.js';

function isFusionSourceModel(value) {
    return value && typeof value === 'object' && Array.isArray(value.sheets);
}

function createLegacyCompatibleSourceModel(rawTemplate, fallbackName) {
    const source = createLocalJsonSourceModel(rawTemplate, fallbackName);
    if (source.hasValidSheets) return source;

    const sheets = Object.keys(rawTemplate || {})
        .filter((key) => key.startsWith('sheet_') && rawTemplate[key] && typeof rawTemplate[key] === 'object')
        .map((key) => ({
            key,
            name: rawTemplate[key].name || key,
            valid: true,
            sheet: rawTemplate[key],
        }));

    return {
        ...source,
        sheets,
        hasValidSheets: sheets.length > 0,
        sourceUsable: sheets.length > 0,
    };
}

function createSourceEntry(origin, source, fallbackName) {
    if (!source) return null;
    return {
        origin,
        source: isFusionSourceModel(source) ? source : createLegacyCompatibleSourceModel(source, fallbackName),
    };
}

function createSourceEntries(sourceA, sourceB) {
    return [
        createSourceEntry('A', sourceA, t("模板 A")),
        createSourceEntry('B', sourceB, t("模板 B")),
    ].filter(Boolean);
}

function getSheetColumnCount(item) {
    const header = item?.sheet?.content?.[0];
    return Array.isArray(header) ? header.length : 0;
}

function getConflictGroupKey(item) {
    if (item.conflictType === FUSION_CONFLICT_TYPES.BOTH) {
        return `both:${item.originSheetKey}:${item.outputName}`;
    }
    if (item.conflictType === FUSION_CONFLICT_TYPES.SHEET_KEY) {
        return `key:${item.originSheetKey}`;
    }
    if (item.conflictType === FUSION_CONFLICT_TYPES.NAME) {
        return `name:${item.outputName}`;
    }
    return item.id;
}

function getSourceLabel(item) {
    return item.origin === 'A' ? t("模板 A") : t("模板 B");
}

function buildConflictRows(selectionModel) {
    const groups = new Map();
    selectionModel.forEach((item) => {
        const groupKey = getConflictGroupKey(item);
        const group = groups.get(groupKey) ?? [];
        group.push(item);
        groups.set(groupKey, group);
    });

    return Array.from(groups.values()).map((group) => {
        const selectedItem = group.find((item) => item.selected) ?? group[0];
        const conflict = group.some((item) => item.conflictType);
        const sourceOptions = conflict
            ? group.map((item) => ({
                id: item.id,
                label: `${getSourceLabel(item)}：${item.outputName}`,
                selected: item.id === selectedItem.id,
            }))
            : [];

        return buildFusionCompareRowHtml({
            id: selectedItem.id,
            key: selectedItem.originSheetKey,
            name: selectedItem.outputName,
            cols: getSheetColumnCount(selectedItem),
            source: getSourceLabel(selectedItem),
            sourceClass: conflict
                ? 'phone-source-conflict'
                : (selectedItem.origin === 'A' ? 'phone-source-a' : 'phone-source-b'),
            conflict,
            selected: selectedItem.selected,
            sourceOptions,
        });
    }).join('');
}

function collectSelectionOverrides(container, baseSelectionModel) {
    const overrides = {};
    const rows = container.querySelectorAll('.phone-fusion-table-row');
    rows.forEach((row) => {
        const checkbox = row.querySelector('.phone-fusion-check');
        const checked = checkbox?.checked !== false;
        const sourceSelect = row.querySelector('.phone-fusion-source-select');
        if (sourceSelect) {
            const options = Array.from(sourceSelect.options ?? []);
            if (options.length === 0 && row.dataset.key) {
                const preferredOrigin = sourceSelect.value || 'A';
                ['A', 'B'].forEach((origin) => {
                    overrides[`${origin}:${row.dataset.key}`] = {
                        selected: checked && origin === preferredOrigin,
                        conflictStrategy: FUSION_CONFLICT_STRATEGIES.REPLACE,
                    };
                });
                return;
            }

            options.forEach((option) => {
                overrides[option.value] = {
                    selected: checked && option.value === sourceSelect.value,
                    conflictStrategy: FUSION_CONFLICT_STRATEGIES.REPLACE,
                };
            });
            return;
        }

        const id = row.dataset.id;
        if (id) {
            overrides[id] = { selected: checked };
        }
    });

    baseSelectionModel.forEach((item) => {
        if (!overrides[item.id] && !item.selected) {
            overrides[item.id] = { selected: false };
        }
    });
    return overrides;
}

function renderMergedDownload(container, mergedTemplate) {
    const sheetCount = Object.keys(mergedTemplate).filter(k => k.startsWith('sheet_')).length;
    const resultEl = container.querySelector('#phone-fusion-result');
    if (!(resultEl instanceof HTMLElement)) return sheetCount;

    if (sheetCount === 0) {
        clearFusionResult(container);
        resultEl.innerHTML = buildFusionEmptyResultHtml();
        return sheetCount;
    }

    clearFusionResult(container);
    const jsonStr = JSON.stringify(mergedTemplate, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const nextUrl = URL.createObjectURL(blob);
    setFusionDownloadUrl(nextUrl);

    resultEl.innerHTML = buildFusionSuccessResultHtml(nextUrl, sheetCount);
    return sheetCount;
}

export function renderFusionCompare(container, sourceA, sourceB) {
    const compareEl = container.querySelector('#phone-fusion-compare');
    const actionsEl = container.querySelector('#phone-fusion-actions');

    if (!compareEl || !actionsEl) return;

    if (!sourceA || !sourceB) {
        compareEl.innerHTML = '';
        actionsEl.style.display = 'none';
        clearFusionResult(container);
        return;
    }

    const selectionModel = buildFusionSelectionModel(createSourceEntries(sourceA, sourceB));
    const rowsHtml = buildConflictRows(selectionModel);

    compareEl.innerHTML = buildFusionCompareHtml(rowsHtml);
    actionsEl.style.display = 'flex';
}

export function performFusionMerge(container, sourceA, sourceB) {
    const sourceEntries = createSourceEntries(sourceA, sourceB);
    const baseSelectionModel = buildFusionSelectionModel(sourceEntries);
    const overrides = collectSelectionOverrides(container, baseSelectionModel);
    const selectionModel = baseSelectionModel.map(item => ({ ...item, ...overrides[item.id] }));
    const mergedTemplate = buildMergedFusionTemplate(selectionModel);
    const sheetCount = renderMergedDownload(container, mergedTemplate);
    return { mergedTemplate, sheetCount };
}
