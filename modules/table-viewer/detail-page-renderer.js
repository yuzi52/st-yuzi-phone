import { t } from '../i18n/index.js';
import { getTableData } from '../phone-core/data-api.js';
import { createDdlFieldMetadata } from './ddl-field-metadata.js';
import { createGenericTemplateStylePayload } from './generic-style-payload.js';
import { buildGenericDetailPageHtml } from './detail-page-template.js';
import { bindGenericDetailEditController } from './detail-edit-controller.js';
import { buildGenericDetailRowPayload } from './detail-row-payload.js';
import { showInlineToast, bindWheelBridge } from './shared-ui.js';

function hasMappedDdlFields(ddlFieldMetadata) {
    return !!(
        ddlFieldMetadata?.byRawIndex
        && typeof ddlFieldMetadata.byRawIndex === 'object'
        && Object.keys(ddlFieldMetadata.byRawIndex).length > 0
    );
}

function resolveDetailDdlFieldMetadata(options = {}) {
    const {
        ddlFieldMetadata,
        sheetKey = '',
        headers = [],
        rawHeaders = [],
    } = options;

    if (hasMappedDdlFields(ddlFieldMetadata)) {
        return ddlFieldMetadata;
    }

    let rawData = null;
    try {
        rawData = getTableData();
    } catch {
        return ddlFieldMetadata || createDdlFieldMetadata({ headers, rawHeaders });
    }

    const safeSheetKey = String(sheetKey || '').trim();
    const sheet = rawData && typeof rawData === 'object' && safeSheetKey
        ? rawData[safeSheetKey]
        : null;
    const ddl = String(sheet?.sourceData?.ddl || '');

    if (!ddl.trim()) {
        return ddlFieldMetadata || createDdlFieldMetadata({ headers, rawHeaders });
    }

    return createDdlFieldMetadata({
        ddl,
        headers,
        rawHeaders,
    });
}

export function renderGenericDetailPage(options = {}) {
    const {
        container,
        state,
        sheetKey,
        headers = [],
        rawHeaders = [],
        rows = [],
        genericMatch,
        ddlFieldMetadata,
        render,
        restoreListScroll,
        captureDetailScroll,
        restoreDetailScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        isTableCellLocked,
        toggleTableCellLock,
        getLiveTableName,
        updateTableRow,
        buildMutationDiagnostics,
        viewerRuntime,
        syncRowsFromSheet,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    const row = rows[state.rowIndex];
    if (!row) {
        state.returnToListMode();
        if (typeof render === 'function') {
            render();
        }
        showInlineToast(container, t("当前详情行已不存在，已返回列表"), true);
        return;
    }

    const lockState = getTableLockState(sheetKey);
    state.syncLockState(lockState);
    const lockedRows = new Set(lockState.rows);
    const lockedCols = new Set(lockState.cols);
    const lockedCells = new Set(lockState.cells);

    const genericStylePayload = createGenericTemplateStylePayload(genericMatch, 'detail');
    const effectiveDdlFieldMetadata = resolveDetailDdlFieldMetadata({
        ddlFieldMetadata,
        sheetKey,
        headers,
        rawHeaders,
    });
    const {
        title,
        rowIndexForLock,
        rowLocked,
        shouldHideLeadingPlaceholder,
        shouldSkipColumn,
        toLockColIndex,
        kvPairs,
        pagerInfo,
    } = buildGenericDetailRowPayload({
        row,
        state,
        headers,
        rawHeaders,
        fieldBindings: genericStylePayload.fieldBindings,
        ddlFieldMetadata: effectiveDdlFieldMetadata,
        sheetKey,
        rowsCount: rows.length,
        saving: state.saving,
        isTableRowLocked: (_sheetKey, rowIndex) => lockedRows.has(Number(rowIndex)),
        isTableCellLocked: (_sheetKey, rowIndex, colIndex) => lockedRows.has(Number(rowIndex))
            || lockedCols.has(Number(colIndex))
            || lockedCells.has(`${Number(rowIndex)}:${Number(colIndex)}`),
    });

    container.innerHTML = buildGenericDetailPageHtml({
        title,
        kvPairs,
        rowLocked,
        pagerInfo,
        genericStylePayload,
        state,
    });

    bindWheelBridge(container);

    bindGenericDetailEditController({
        container,
        state,
        rowLocked,
        rowIndexForLock,
        sheetKey,
        rawHeaders,
        rows,
        ddlFieldMetadata: effectiveDdlFieldMetadata,
        shouldHideLeadingPlaceholder,
        shouldSkipColumn,
        toLockColIndex,
        render,
        restoreListScroll,
        captureDetailScroll,
        restoreDetailScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        toggleTableCellLock,
        isTableCellLocked,
        getLiveTableName,
        updateTableRow,
        buildMutationDiagnostics,
        syncRowsFromSheet,
        showInlineToast,
        runtime: viewerRuntime,
    });
}
