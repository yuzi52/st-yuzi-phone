const queues = new Map();

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
        if (JSON.stringify(old[key]) === JSON.stringify(next[key])) continue;
        if (JSON.stringify(entries[key]) !== JSON.stringify(old[key]) && JSON.stringify(entries[key]) !== JSON.stringify(next[key])) {
            throw new Error('世界书条目已被其他操作修改，请重试同步');
        }
        if (Object.hasOwn(next, key)) entries[key] = next[key];
        else delete entries[key];
    }
    return { ...current, entries };
}
