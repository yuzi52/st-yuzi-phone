import { getTableData, getTableLockState, isTableRowLocked, remapTableLockStateAfterRowsDelete } from '../phone-core/data-api.js';
import { deleteSheetRows } from '../phone-core/table-support.js';
import { t } from '../i18n/index.js';

// Keep the confirmed table snapshot, not just indexes: queued mutations may move rows.
function signature(sheet, deleted = []) {
    if (!sheet) return '';
    const removed = new Set(deleted.map(index => index + 1));
    return JSON.stringify({
        name: sheet.name,
        ddl: sheet.sourceData?.ddl || sheet.ddl,
        tableName: sheet.sourceData?.tableName,
        physicalTableName: sheet.sourceData?.physicalTableName,
        content: sheet.content?.filter((_, index) => !removed.has(index)),
    });
}

export function createBottomDeleteSession(isActive) {
    let key = '', table = null, version = '', deleting = false, generation = 0;
    const selected = new Set();
    const cancel = () => {
        ++generation;
        key = ''; table = null; version = ''; selected.clear();
    };
    const canSelect = index => !!key && !deleting && Number.isInteger(index)
        && Array.isArray(table?.content?.[index + 1]) && !isTableRowLocked(key, index);
    const lockedRows = () => new Set(getTableLockState(key).rows);
    return {
        get active() { return !!key; },
        get deleting() { return deleting; },
        get count() { return selected.size; },
        has: index => selected.has(index),
        locked: index => isTableRowLocked(key, index),
        lockedRows,
        cancel,
        begin(raw, sheetKey) {
            if (deleting) return;
            cancel();
            if (!Array.isArray(raw?.[sheetKey]?.content)) return;
            key = sheetKey; table = structuredClone(raw[key]); version = signature(table);
        },
        sync(raw) {
            if (!key || deleting) return false;
            if (signature(raw?.[key]) !== version) { cancel(); return true; }
            const rowLocks = selected.size ? lockedRows() : null;
            for (const index of selected) if (rowLocks.has(index)) selected.delete(index);
            return false;
        },
        toggle(index) {
            if (!canSelect(index)) return;
            if (selected.has(index)) selected.delete(index);
            else selected.add(index);
        },
        selectAll() {
            if (!key || deleting) return;
            let rowLocks;
            table.content.slice(1).forEach((row, index) => {
                if (!Array.isArray(row)) return;
                rowLocks ||= lockedRows();
                if (!rowLocks.has(index)) selected.add(index);
            });
        },
        clear() { if (!deleting) selected.clear(); },
        async remove() {
            if (!key || deleting || !selected.size) return { status: 'cancelled' };
            const token = generation, sheetKey = key, confirmed = table;
            const indexes = [...selected];
            const lockStateBeforeDelete = getTableLockState(sheetKey);
            const isCurrent = (deleted = []) => {
                if (!isActive() || token !== generation
                    || signature(getTableData()?.[sheetKey]) !== signature(confirmed, deleted)) return false;
                const deletedSet = new Set(deleted);
                let rowLocks;
                return indexes.every(index => {
                    if (deletedSet.has(index)) return true;
                    rowLocks ||= new Set(getTableLockState(sheetKey).rows);
                    return !rowLocks.has(index);
                });
            };
            if (!isCurrent()) { cancel(); return { status: 'updated' }; }
            deleting = true;
            try {
                const result = await deleteSheetRows(sheetKey, indexes, { tableName: confirmed.name || sheetKey, isCurrent });
                const deleted = result.deletedRowIndexes || [];
                // Never apply old-chat lock positions to a replacement chat.
                if (deleted.length && isActive() && signature(getTableData()?.[sheetKey]) === signature(confirmed, deleted)) {
                    remapTableLockStateAfterRowsDelete(sheetKey, deleted, { beforeState: lockStateBeforeDelete });
                }
                if (!isActive() || token !== generation) return { status: 'cancelled' };
                return { status: result.code === 'cancelled' ? 'updated' : 'finished', ...result };
            } catch (error) {
                return { status: 'finished', ok: false, message: error?.message || t('删除失败') };
            } finally {
                deleting = false;
                if (token === generation) cancel();
            }
        },
    };
}
