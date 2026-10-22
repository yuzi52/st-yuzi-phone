import { t } from '../i18n/index.js';
const subscribers = new Set();

const EMPTY_REVIEW_STATE = Object.freeze({
    status: 'empty',
    sessionKey: '',
    chatKey: '',
    floorId: -1,
    unupdatedFloorCount: null,
    createdAt: 0,
    updatedAt: 0,
    tableCount: 0,
    changeCount: 0,
    message: '暂无本楼更新',
    tables: [],
    error: null,
});

let currentState = { ...EMPTY_REVIEW_STATE };

function cloneTable(table = {}) {
    return {
        ...table,
        updatedRowIndexes: Array.isArray(table.updatedRowIndexes) ? [...table.updatedRowIndexes] : [],
        updatedRowIds: Array.isArray(table.updatedRowIds) ? [...table.updatedRowIds] : [],
        changes: Array.isArray(table.changes) ? table.changes.map(cloneChange) : [],
    };
}

function cloneField(field = {}) {
    return { ...field };
}

function cloneChange(change = {}) {
    return {
        ...change,
        fields: Array.isArray(change.fields) ? change.fields.map(cloneField) : [],
    };
}

function cloneState(state = currentState) {
    return {
        ...state,
        tables: Array.isArray(state.tables) ? state.tables.map(cloneTable) : [],
        error: state.error && typeof state.error === 'object' ? { ...state.error } : state.error,
    };
}

function notifySubscribers() {
    const snapshot = cloneState();
    Array.from(subscribers).forEach((callback) => {
        try { callback(snapshot); } catch {}
    });
}

export function getReviewState() {
    return cloneState();
}

function normalizeText(value) {
    return String(value ?? '').trim();
}

export function setReviewState(nextState = {}) {
    const source = nextState && typeof nextState === 'object' ? nextState : {};
    currentState = {
        ...EMPTY_REVIEW_STATE,
        ...source,
        sessionKey: normalizeText(source.sessionKey),
        chatKey: normalizeText(source.chatKey),
        tables: Array.isArray(source.tables) ? source.tables.map(cloneTable) : [],
        updatedAt: Date.now(),
    };
    notifySubscribers();
    return getReviewState();
}

export function resetReviewState(message = t("暂无本楼更新"), overrides = {}) {
    const source = overrides && typeof overrides === 'object' ? overrides : {};
    return setReviewState({
        ...EMPTY_REVIEW_STATE,
        ...source,
        message,
        updatedAt: Date.now(),
    });
}

export function subscribeReviewState(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

export function getReviewTableBySheetKey(sheetKey) {
    const key = String(sheetKey || '').trim();
    if (!key) return null;
    const table = currentState.tables.find((table) => table.sheetKey === key);
    return table ? cloneTable(table) : null;
}

export function getUpdatedRowsForSheet(sheetKey) {
    const table = getReviewTableBySheetKey(sheetKey);
    if (!table) return { rowIndexes: new Set(), rowIds: new Set(), changes: [] };
    return {
        rowIndexes: new Set(table.updatedRowIndexes || []),
        rowIds: new Set((table.updatedRowIds || []).map((value) => String(value))),
        changes: table.changes || [],
    };
}

export function hasReviewUpdatesForRow(sheetKey, rowIndex, rowId = '') {
    const rows = getUpdatedRowsForSheet(sheetKey);
    const normalizedRowId = String(rowId ?? '').trim();
    if (normalizedRowId) {
        return rows.rowIds.has(normalizedRowId);
    }

    const normalizedRowIndex = Number(rowIndex);
    return Number.isInteger(normalizedRowIndex) && normalizedRowIndex >= 0 && rows.rowIndexes.has(normalizedRowIndex);
}
