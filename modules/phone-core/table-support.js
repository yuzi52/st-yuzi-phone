import { Logger } from '../error-handler.js';
import { callMutationApiToSettlement, getDB } from './db-bridge.js';
import { deleteTableRowsBatch, getTableData } from './data-api.js';
import { enqueueTableMutation } from './data-api/mutation-queue.js';

const logger = Logger.withScope({ scope: 'phone-core/table-support', feature: 'table-support' });
const TABLE_UPDATED_EVENT_NAME = 'yuzi-phone-table-updated';

function buildSheetDataSnapshot(rawData, sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey || !rawData || typeof rawData !== 'object') return null;

    const sheet = rawData?.[safeSheetKey];
    if (!sheet?.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        return null;
    }

    const headers = Array.isArray(sheet.content[0])
        ? sheet.content[0].map((header, index) => String(header || '').trim() || ('Column ' + (index + 1)))
        : [];

    return {
        sheetKey: safeSheetKey,
        tableName: String(sheet.name || safeSheetKey),
        headers,
        rows: sheet.content.slice(1),
    };
}

export function getSheetDataByKey(sheetKey) {
    return buildSheetDataSnapshot(getTableData(), sheetKey);
}

export async function refreshTableProjection() {
    return enqueueTableMutation('refreshTableProjection', async () => {
        const api = getDB();
        if (!api || typeof api.refreshDataAndWorldbook !== 'function') {
            return false;
        }

        try {
            const result = await callMutationApiToSettlement(
                () => api.refreshDataAndWorldbook(),
                'refreshTableProjection',
            );
            if (result !== true) {
                logger.warn({
                    action: 'projection.refresh-unconfirmed',
                    message: 'refreshDataAndWorldbook did not confirm success',
                    context: { resultType: result === null ? 'null' : typeof result },
                });
            }
            return result === true;
        } catch (error) {
            logger.warn({
                action: 'projection.refresh',
                message: 'refreshDataAndWorldbook failed',
                error,
            });
            return false;
        }
    });
}

export function dispatchTableUpdated(sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey) return false;

    window.dispatchEvent(new CustomEvent(TABLE_UPDATED_EVENT_NAME, {
        detail: {
            sheetKey: safeSheetKey,
            version: 'manual_' + Date.now(),
        },
    }));
    return true;
}

function normalizeDeleteRowIndexes(rowIndexes = [], maxRowCount = Infinity) {
    const maxRows = Number(maxRowCount);
    return Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0)
        .filter((value) => !Number.isFinite(maxRows) || value < maxRows)))
        .sort((a, b) => b - a);
}

function buildDeleteRowIndexResult({
    requestedRowIndexes = [],
    attemptedRowIndexes = [],
    deletedRowIndexes = [],
    failedRowIndexes = [],
    unattemptedRowIndexes,
    notDeletedRowIndexes,
} = {}) {
    const requested = normalizeDeleteRowIndexes(requestedRowIndexes);
    const attempted = normalizeDeleteRowIndexes(attemptedRowIndexes);
    const deleted = normalizeDeleteRowIndexes(deletedRowIndexes);
    const failed = normalizeDeleteRowIndexes(failedRowIndexes);
    const attemptedSet = new Set(attempted);
    const deletedSet = new Set(deleted);

    return {
        requestedRowIndexes: requested,
        attemptedRowIndexes: attempted,
        deletedRowIndexes: deleted,
        failedRowIndexes: failed,
        unattemptedRowIndexes: Array.isArray(unattemptedRowIndexes)
            ? normalizeDeleteRowIndexes(unattemptedRowIndexes)
            : requested.filter((rowIndex) => !attemptedSet.has(rowIndex)),
        notDeletedRowIndexes: Array.isArray(notDeletedRowIndexes)
            ? normalizeDeleteRowIndexes(notDeletedRowIndexes)
            : requested.filter((rowIndex) => !deletedSet.has(rowIndex)),
    };
}

export async function deleteSheetRows(sheetKey, rowIndexes = [], options = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const requestedFallbackRowIndexes = normalizeDeleteRowIndexes(rowIndexes);
    const snapshot = getSheetDataByKey(safeSheetKey);
    if (!snapshot) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: 'Table was not found',
            deletedCount: 0,
            refreshed: false,
            ...buildDeleteRowIndexResult({ requestedRowIndexes: requestedFallbackRowIndexes }),
        };
    }

    const normalizedRowIndexes = normalizeDeleteRowIndexes(rowIndexes, snapshot.rows.length);
    const tableName = String(options.tableName || snapshot.tableName || '').trim();
    if (!tableName) {
        return {
            ok: false,
            code: 'table_name_missing',
            message: 'Table name is missing',
            deletedCount: 0,
            refreshed: false,
            ...buildDeleteRowIndexResult({ requestedRowIndexes: normalizedRowIndexes }),
        };
    }

    if (normalizedRowIndexes.length === 0) {
        return {
            ok: false,
            code: 'empty_selection',
            message: 'No deletable rows were selected',
            deletedCount: 0,
            refreshed: false,
            ...buildDeleteRowIndexResult(),
        };
    }

    const result = await deleteTableRowsBatch(tableName, normalizedRowIndexes, options);
    const resultDeletedRowIndexes = Array.isArray(result.deletedRowIndexes) ? result.deletedRowIndexes : [];
    const resultFailedRowIndexes = Array.isArray(result.failedRowIndexes) ? result.failedRowIndexes : [];
    const resultAttemptedRowIndexes = Array.isArray(result.attemptedRowIndexes)
        ? result.attemptedRowIndexes
        : [...resultDeletedRowIndexes, ...resultFailedRowIndexes];

    if (!result.ok) {
        if (result.deletedCount > 0) {
            dispatchTableUpdated(safeSheetKey);
        }
        return {
            ok: false,
            code: result.code || 'failed',
            message: result.message || 'Delete failed',
            deletedCount: result.deletedCount || 0,
            refreshed: result.refreshed ?? false,
            ...buildDeleteRowIndexResult({
                requestedRowIndexes: normalizedRowIndexes,
                attemptedRowIndexes: resultAttemptedRowIndexes,
                deletedRowIndexes: resultDeletedRowIndexes,
                failedRowIndexes: resultFailedRowIndexes,
                unattemptedRowIndexes: result.unattemptedRowIndexes,
                notDeletedRowIndexes: result.notDeletedRowIndexes,
            }),
        };
    }

    dispatchTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: result.code || 'ok',
        message: result.message || (result.refreshed === false ? 'Delete succeeded, but projection refresh failed' : 'Delete succeeded'),
        deletedCount: result.deletedCount || normalizedRowIndexes.length,
        refreshed: result.refreshed ?? true,
        ...buildDeleteRowIndexResult({
            requestedRowIndexes: normalizedRowIndexes,
            attemptedRowIndexes: resultAttemptedRowIndexes.length > 0 ? resultAttemptedRowIndexes : normalizedRowIndexes,
            deletedRowIndexes: resultDeletedRowIndexes.length > 0 ? resultDeletedRowIndexes : normalizedRowIndexes,
            failedRowIndexes: resultFailedRowIndexes,
            unattemptedRowIndexes: result.unattemptedRowIndexes || [],
            notDeletedRowIndexes: result.notDeletedRowIndexes || [],
        }),
    };
}

