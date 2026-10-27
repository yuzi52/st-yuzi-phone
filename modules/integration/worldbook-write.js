const queues = new Map();

/** Refresh matching editor selections without turning a successful save into a failure. */
export function refreshWorldbookEditors(context, names) {
    for (const name of new Set(names.filter(Boolean))) {
        try {
            context?.reloadWorldInfoEditor?.(name, false);
        } catch (error) {
            console.warn('[玉子手机] 世界书编辑器刷新失败', name, error);
        }
    }
}

/** Serialize our extension's read/modify/save cycles, including different apps sharing a book. */
export function withWorldbookWrite(name, operation) {
    const task = (queues.get(name) || Promise.resolve()).then(operation);
    const settled = task.catch(() => {});
    queues.set(name, settled);
    void settled.then(() => { if (queues.get(name) === settled) queues.delete(name); });
    return task;
}

/** Apply only the caller's changed entries. Never replace a concurrent app's unrelated entries. */
export function mergeWorldbookChanges(before, edited, current) {
    const entries = { ...(current.entries || {}) };
    const old = before.entries || {}, next = edited.entries || {};
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
        const previousSignature = JSON.stringify(old[key]);
        const nextSignature = JSON.stringify(next[key]);
        if (previousSignature === nextSignature) continue;
        const currentSignature = JSON.stringify(entries[key]);
        if (currentSignature !== previousSignature && currentSignature !== nextSignature) {
            throw new Error('世界书条目已被其他操作修改，请重试同步');
        }
        if (Object.hasOwn(next, key)) entries[key] = next[key];
        else delete entries[key];
    }
    return { ...current, entries };
}
