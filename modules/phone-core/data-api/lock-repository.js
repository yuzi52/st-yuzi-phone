import { Logger } from '../../error-handler.js';
import { getDB, isDbBooleanSuccess } from '../db-bridge.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/lock-repository', feature: 'db-api' });

function normalizeLockState(lockState) {
    if (!lockState || typeof lockState !== 'object') {
        return { rows: [], cols: [], cells: [] };
    }

    const rows = Array.isArray(lockState.rows)
        ? lockState.rows.map((value) => Number(value)).filter(Number.isInteger)
        : [];

    const cols = Array.isArray(lockState.cols)
        ? lockState.cols.map((value) => Number(value)).filter(Number.isInteger)
        : [];

    const cells = Array.isArray(lockState.cells)
        ? lockState.cells.map((value) => {
            if (Array.isArray(value) && value.length >= 2) {
                const row = Number(value[0]);
                const col = Number(value[1]);
                if (Number.isInteger(row) && Number.isInteger(col)) return `${row}:${col}`;
                return null;
            }
            return String(value || '').trim() || null;
        }).filter(Boolean)
        : [];

    return {
        rows: Array.from(new Set(rows)),
        cols: Array.from(new Set(cols)),
        cells: Array.from(new Set(cells)),
    };
}

function isLockWriteSuccess(value) {
    return isDbBooleanSuccess(value);
}

function remapLockStateAfterRowsDelete(lockState, deletedRowIndexes = []) {
    const current = normalizeLockState(lockState);
    const deletedSet = new Set((Array.isArray(deletedRowIndexes) ? deletedRowIndexes : [deletedRowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0));
    if (deletedSet.size === 0) {
        return current;
    }

    const deletedSorted = Array.from(deletedSet).sort((a, b) => a - b);
    const shiftRowIndex = (rowIdx) => rowIdx - deletedSorted.filter((deletedIdx) => deletedIdx < rowIdx).length;

    const rowsNext = current.rows
        .filter(rowIdx => !deletedSet.has(rowIdx))
        .map(shiftRowIndex)
        .filter(Number.isInteger)
        .filter(rowIdx => rowIdx >= 0);

    const cellsNext = current.cells
        .map((key) => {
            const [rowPart, colPart] = String(key).split(':');
            const rowIdx = Number(rowPart);
            const colIdx = Number(colPart);
            if (!Number.isInteger(rowIdx) || !Number.isInteger(colIdx)) return null;
            if (deletedSet.has(rowIdx)) return null;
            const nextRowIdx = shiftRowIndex(rowIdx);
            if (!Number.isInteger(nextRowIdx) || nextRowIdx < 0) return null;
            return `${nextRowIdx}:${colIdx}`;
        })
        .filter(Boolean);

    return {
        rows: Array.from(new Set(rowsNext)),
        cols: current.cols,
        cells: Array.from(new Set(cellsNext)),
    };
}

function remapLockStateAfterRowDelete(lockState, deletedRowIndex) {
    return remapLockStateAfterRowsDelete(lockState, [deletedRowIndex]);
}

function setTableColLock(sheetKey, colIndex, locked) {
    const api = getDB();
    if (!api) return false;

    try {
        if (typeof api.lockTableCol === 'function') {
            return isLockWriteSuccess(api.lockTableCol(sheetKey, colIndex, locked));
        }

        if (typeof api.getTableLockState === 'function' && typeof api.setTableLockState === 'function') {
            const current = normalizeLockState(api.getTableLockState(sheetKey));
            const nextCols = new Set(current.cols);
            if (locked) {
                nextCols.add(Number(colIndex));
            } else {
                nextCols.delete(Number(colIndex));
            }

            return isLockWriteSuccess(api.setTableLockState(sheetKey, {
                rows: current.rows,
                cols: Array.from(nextCols).filter(Number.isInteger),
                cells: current.cells,
            }, { merge: false }));
        }
    } catch (error) {
        logger.warn({
            action: 'lock.col.set',
            message: 'lockTableCol/setTableLockState 调用失败',
            context: { sheetKey, colIndex, locked: !!locked },
            error,
        });
        return false;
    }

    return false;
}

export function getTableLockState(sheetKey) {
    const api = getDB();
    if (!api || typeof api.getTableLockState !== 'function') {
        return { rows: [], cols: [], cells: [] };
    }

    try {
        const lockState = api.getTableLockState(sheetKey);
        return normalizeLockState(lockState);
    } catch (error) {
        logger.warn({
            action: 'lock.state.get',
            message: 'getTableLockState 调用失败',
            context: { sheetKey },
            error,
        });
        return { rows: [], cols: [], cells: [] };
    }
}

export function remapTableLockStateAfterRowDelete(sheetKey, deletedRowIndex) {
    const api = getDB();
    if (!api || typeof api.getTableLockState !== 'function' || typeof api.setTableLockState !== 'function') {
        return false;
    }

    try {
        const current = api.getTableLockState(sheetKey);
        const next = remapLockStateAfterRowDelete(current, deletedRowIndex);
        return isLockWriteSuccess(api.setTableLockState(sheetKey, next, { merge: false }));
    } catch (error) {
        logger.warn({
            action: 'lock.state.remap-after-row-delete',
            message: '删除后重排锁状态失败',
            context: { sheetKey, deletedRowIndex },
            error,
        });
        return false;
    }
}

function sameLockState(left, right) {
    const canonical = value => {
        const state = normalizeLockState(value);
        return JSON.stringify({ rows: state.rows.sort((a, b) => a - b), cols: state.cols.sort((a, b) => a - b), cells: state.cells.sort() });
    };
    return canonical(left) === canonical(right);
}

export function remapTableLockStateAfterRowsDelete(sheetKey, deletedRowIndexes = [], options = {}) {
    const api = getDB();
    if (!api || typeof api.getTableLockState !== 'function' || typeof api.setTableLockState !== 'function') {
        return false;
    }

    try {
        const current = api.getTableLockState(sheetKey);
        const next = remapLockStateAfterRowsDelete(options.beforeState ?? current, deletedRowIndexes);
        if (options.beforeState) {
            // Newer database APIs already remap locks. Never shift their result twice,
            // or overwrite an unrelated lock change made while the mutation settled.
            if (sameLockState(current, next)) return true;
            if (!sameLockState(current, options.beforeState)) return false;
        }
        return isLockWriteSuccess(api.setTableLockState(sheetKey, next, { merge: false }));
    } catch (error) {
        logger.warn({
            action: 'lock.state.remap-after-rows-delete',
            message: '批量删除后重排锁状态失败',
            context: { sheetKey, deletedRowIndexes },
            error,
        });
        return false;
    }
}

export function setTableCellLock(sheetKey, rowIndex, colIndex, locked) {
    const api = getDB();
    if (!api || typeof api.lockTableCell !== 'function') return false;

    try {
        return isLockWriteSuccess(api.lockTableCell(sheetKey, rowIndex, colIndex, locked));
    } catch (error) {
        logger.warn({
            action: 'lock.cell.set',
            message: 'lockTableCell 调用失败',
            context: { sheetKey, rowIndex, colIndex, locked: !!locked },
            error,
        });
        return false;
    }
}

export function setTableRowLock(sheetKey, rowIndex, locked) {
    const api = getDB();
    if (!api) return false;

    try {
        if (typeof api.lockTableRow === 'function') {
            return isLockWriteSuccess(api.lockTableRow(sheetKey, rowIndex, !!locked));
        }

        if (typeof api.getTableLockState === 'function' && typeof api.setTableLockState === 'function') {
            const current = normalizeLockState(api.getTableLockState(sheetKey));
            const nextRows = new Set(current.rows);
            if (locked) {
                nextRows.add(Number(rowIndex));
            } else {
                nextRows.delete(Number(rowIndex));
            }

            return isLockWriteSuccess(api.setTableLockState(sheetKey, {
                rows: Array.from(nextRows).filter(Number.isInteger),
                cols: current.cols,
                cells: current.cells,
            }, { merge: false }));
        }
    } catch (error) {
        logger.warn({
            action: 'lock.row.set',
            message: 'lockTableRow/setTableLockState 调用失败',
            context: { sheetKey, rowIndex, locked: !!locked },
            error,
        });
        return false;
    }

    return false;
}

export function isTableRowLocked(sheetKey, rowIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;
    return lockState.rows.includes(Number(rowIndex));
}

export function isTableCellLocked(sheetKey, rowIndex, colIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;

    const numericRowIndex = Number(rowIndex);
    const numericColIndex = Number(colIndex);
    const rowLocked = lockState.rows.includes(numericRowIndex);
    const colLocked = lockState.cols.includes(numericColIndex);
    const key = `${numericRowIndex}:${numericColIndex}`;
    const cellLocked = lockState.cells.includes(key);
    return rowLocked || colLocked || cellLocked;
}

// Database toggles return operation success, not the resulting lock state.
// Never retry a toggle after failure: it may already have changed the lock.
function toggleTableLock(methodName, args, isLocked, setLocked) {
    const api = getDB();
    const [sheetKey] = args;
    const failure = { ok: false, locked: null };
    if (typeof api?.getTableLockState !== 'function') return failure;

    const readState = () => {
        const state = api.getTableLockState(sheetKey);
        return state && Array.isArray(state.rows) && Array.isArray(state.cols) && Array.isArray(state.cells)
            ? normalizeLockState(state)
            : null;
    };

    try {
        let result;
        if (typeof api[methodName] === 'function') {
            result = api[methodName](...args);
        } else {
            const before = readState();
            if (!before) return failure;
            result = setLocked(!isLocked(before));
        }
        if (!isLockWriteSuccess(result)) return failure;
        const after = readState();
        return after ? { ok: true, locked: isLocked(after) } : failure;
    } catch (error) {
        logger.warn({
            action: 'lock.toggle',
            message: '锁定状态切换或读取失败',
            context: { methodName, sheetKey },
            error,
        });
        return failure;
    }
}

/** @returns {{ ok: boolean, locked: boolean | null }} */
export function toggleTableRowLock(sheetKey, rowIndex) {
    return toggleTableLock('toggleTableRowLock', [sheetKey, rowIndex],
        state => state.rows.includes(Number(rowIndex)),
        locked => setTableRowLock(sheetKey, rowIndex, locked));
}

/** @returns {{ ok: boolean, locked: boolean | null }} */
export function toggleTableCellLock(sheetKey, rowIndex, colIndex) {
    return toggleTableLock('toggleTableCellLock', [sheetKey, rowIndex, colIndex],
        state => state.rows.includes(Number(rowIndex)) || state.cols.includes(Number(colIndex))
            || state.cells.includes(`${Number(rowIndex)}:${Number(colIndex)}`),
        locked => setTableCellLock(sheetKey, rowIndex, colIndex, locked));
}

/** @returns {{ ok: boolean, locked: boolean | null }} */
export function toggleTableColLock(sheetKey, colIndex) {
    return toggleTableLock('toggleTableColLock', [sheetKey, colIndex],
        state => state.cols.includes(Number(colIndex)),
        locked => setTableColLock(sheetKey, colIndex, locked));
}
