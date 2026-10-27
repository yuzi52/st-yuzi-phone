import { getTableData, updateTableRow } from '../phone-core/data-api.js';
import { t } from '../i18n/index.js';

// ponytail: compare snapshots only on refresh/save, not keystrokes; use row revisions if large tables become a bottleneck.
function snapshot(raw) {
    const keys = raw && typeof raw === 'object'
        ? Object.keys(raw).filter(key => key.startsWith('sheet_'))
        : [];
    return Object.fromEntries(keys.sort().map(key => [key, {
        name: String(raw[key].name || key),
        ddl: String(raw[key].sourceData?.ddl || ''),
        content: (Array.isArray(raw[key].content) ? raw[key].content : []).map(row => Array.isArray(row) ? row.map(value => String(value ?? '')) : []),
    }]));
}

export function createBottomEditSession(isActive) {
    let active = false, saving = false, generation = 0;
    let tables = {}, version = '', pending = null;
    const drafts = new Map();
    const cancel = () => {
        ++generation;
        active = saving = false;
        tables = {}; version = ''; pending = null; drafts.clear();
    };
    const sync = raw => {
        if (!active) return false;
        const latest = snapshot(raw), signature = JSON.stringify(latest);
        if (signature === version) return false;
        if (signature === pending?.signature) {
            tables = latest; version = signature;
            return false;
        }
        cancel();
        return true;
    };
    return {
        get active() { return active; },
        get saving() { return saving; },
        begin(raw) {
            cancel();
            tables = snapshot(raw); version = JSON.stringify(tables); active = true;
        },
        cancel,
        sync,
        value(key, row, col, fallback) {
            return drafts.get(key)?.get(row)?.get(col) ?? String(fallback ?? '');
        },
        change(key, row, col, value) {
            if (!active || saving || !tables[key]?.content[row + 1]) return;
            if (!drafts.has(key)) drafts.set(key, new Map());
            const rows = drafts.get(key);
            if (!rows.has(row)) rows.set(row, new Map());
            const fields = rows.get(row);
            if (value === String(tables[key].content[row + 1][col] ?? '')) fields.delete(col);
            else fields.set(col, value);
            if (!fields.size) rows.delete(row);
            if (!rows.size) drafts.delete(key);
        },
        async save() {
            if (!active || saving) return { status: 'cancelled' };
            const token = generation;
            const isCurrent = () => active && token === generation && isActive();
            let saved = 0;
            saving = true;
            try {
                for (const [key, rows] of drafts) {
                    for (const [row, fields] of rows) {
                        if (!isCurrent()) return { status: 'cancelled' };
                        if (sync(getTableData())) return { status: 'updated' };
                        const sheet = tables[key];
                        const content = sheet.content.slice();
                        content[row + 1] = content[row + 1].slice();
                        const data = {};
                        for (const [col, value] of fields) {
                            data[sheet.content[0][col]] = value;
                            content[row + 1][col] = value;
                        }
                        const expected = { ...tables, [key]: { ...sheet, content } };
                        pending = { signature: JSON.stringify(expected) };
                        const result = await updateTableRow(sheet.name, row + 1, data, {
                            isCurrent: () => isCurrent() && !sync(getTableData()),
                        });
                        if (!isCurrent()) return { status: 'cancelled' };
                        if (!result?.ok) return { status: 'failed', saved, message: result?.message || t('保存失败') };
                        tables = expected; version = pending.signature; pending = null;
                        rows.delete(row); ++saved;
                    }
                    drafts.delete(key);
                }
                cancel();
                return { status: 'saved', saved };
            } catch (error) {
                return isCurrent() ? { status: 'failed', saved, message: error?.message || t('保存失败') } : { status: 'cancelled' };
            } finally {
                if (token === generation) { saving = false; pending = null; }
            }
        },
    };
}
