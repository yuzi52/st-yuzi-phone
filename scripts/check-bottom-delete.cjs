const assert = require('node:assert/strict');

async function main() {
    const host = { extensionSettings: {}, saveSettingsDebounced() {} };
    global.window = Object.assign(new EventTarget(), { getContext: () => host, setTimeout, clearTimeout });
    global.CustomEvent = class extends Event {
        constructor(type, options) { super(type); this.detail = options.detail; }
    };
    const { createBottomDeleteSession } = await import('../modules/bottom-visualization/delete-session.js');
    const { buildTableContent } = await import('../modules/bottom-visualization/view.js');
    const { enqueueTableMutation } = await import('../modules/phone-core/data-api/mutation-queue.js');
    let raw, locks, calls, alive, afterDelete, failIndex, lockWrites;
    function reset(sql = false) {
        raw = { sheet_a: {
            name: '测试表', sourceData: { ddl: 'CREATE TABLE test_rows (row_id INTEGER, value TEXT)' },
            content: [['row_id', '内容'], [7, '甲'], [12, '乙'], [18, '丙']],
        } };
        locks = { rows: [], cols: [], cells: [] };
        calls = []; alive = true; afterDelete = null; failIndex = -1; lockWrites = 0;
        window.AutoCardUpdaterAPI = {
            exportTableAsJson: () => structuredClone(raw),
            getTableLockState: () => structuredClone(locks),
            setTableLockState(_key, next) { locks = next; lockWrites++; return true; },
            async deleteRow(name, dbIndex) {
                calls.push({ name, dbIndex });
                if (dbIndex === failIndex) return false;
                raw.sheet_a.content.splice(dbIndex, 1);
                await afterDelete?.();
                return true;
            },
        };
        if (sql) window.AutoCardUpdaterAPI.executeSqlMutation = async (query, ids) => {
            calls.push({ query, ids });
            raw.sheet_a.content = raw.sheet_a.content.filter((row, index) => !index || !ids.includes(row[0]));
            return { saved: true, changes: ids.length, errors: [] };
        };
        const session = createBottomDeleteSession(() => alive);
        session.begin(raw, 'sheet_a');
        return session;
    }

    let session = reset(true);
    locks = { rows: [1], cols: [2], cells: ['2:1'] };
    session.selectAll();
    assert.equal(session.count, 2, '全选跳过锁定行');
    session.toggle(1);
    assert.equal(session.count, 2, '锁定行不可手动选择');
    const cards = buildTableContent(raw, 'sheet_a', true, null, session).html;
    assert.ok(cards.indexOf('data-row-index="2"') < cards.indexOf('data-row-index="0"'), '倒序不改变删除用的原始索引');
    assert.match(cards, /data-row-index="1"[^>]*disabled/, '锁定行按钮禁用');
    assert.match(cards, /aria-pressed="true"/, '选中状态可访问');
    let result = await session.remove();
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1, '复用单条 SQL 批量删除');
    assert.deepEqual([...calls[0].ids].sort((a, b) => a - b), [7, 18], '删除映射到实际 row_id');
    assert.deepEqual(raw.sheet_a.content.slice(1), [[12, '乙']]);
    assert.deepEqual(locks, { rows: [0], cols: [2], cells: [] }, '删除后复用锁定位置重排');
    assert.equal(session.active, false);

    session = reset(true); locks.rows = [1]; session.selectAll();
    const sqlDelete = window.AutoCardUpdaterAPI.executeSqlMutation;
    window.AutoCardUpdaterAPI.executeSqlMutation = async (...args) => {
        const result = await sqlDelete(...args);
        locks.rows = [0]; // Real database already moved the surviving locked row.
        return result;
    };
    result = await session.remove();
    assert.equal(result.ok, true);
    assert.deepEqual(locks.rows, [0], '数据库已调整的锁定位置不得重复调整');
    assert.equal(lockWrites, 0, '已正确调整时不重复写锁定状态');

    session = reset(true); locks.rows = [1]; session.toggle(0);
    const externalDelete = window.AutoCardUpdaterAPI.executeSqlMutation;
    window.AutoCardUpdaterAPI.executeSqlMutation = async (...args) => {
        const result = await externalDelete(...args);
        locks.rows = [1, 0]; // Concurrent lock change, different from before and expected.
        return result;
    };
    await session.remove();
    assert.deepEqual(locks.rows, [1, 0], '删除期间的其他锁定变更不得被旧快照覆盖');
    assert.equal(lockWrites, 0);

    session = reset(); session.selectAll();
    result = await session.remove();
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map(call => call.dbIndex), [3, 2, 1], '旧 API 倒序删除并允许本次已删行的快照变化');

    session = reset(); session.selectAll(); failIndex = 2;
    result = await session.remove();
    assert.equal(result.ok, false);
    assert.equal(result.deletedCount, 1);
    assert.deepEqual(result.notDeletedRowIndexes, [1, 0], '部分失败保留未删记录');
    assert.equal(session.active, false, '部分失败后退出，重试需要重新选择');

    session = reset(); session.selectAll();
    raw.sheet_a.content.splice(1, 1);
    result = await session.remove();
    assert.equal(result.status, 'updated');
    assert.equal(calls.length, 0, '确认前行号变化不得写入');

    session = reset(); session.toggle(0); locks.rows = [0];
    result = await session.remove();
    assert.equal(result.status, 'updated');
    assert.equal(calls.length, 0, '确认前新增锁定不得删除');

    for (const change of ['data', 'chat', 'close', 'lock']) {
        session = reset(true); session.toggle(0);
        let release;
        const blocker = enqueueTableMutation('test-blocker', () => new Promise(resolve => { release = resolve; }));
        await new Promise(resolve => setImmediate(resolve));
        const pending = session.remove();
        if (change === 'data') raw.sheet_a.content.reverse();
        if (change === 'chat') alive = false;
        if (change === 'close') session.cancel();
        if (change === 'lock') locks.rows = [0];
        release(); await blocker; await pending;
        assert.equal(calls.length, 0, `排队期间 ${change} 变化必须阻止写入`);
    }

    session = reset(); session.selectAll();
    afterDelete = () => { raw.sheet_a.content[1][1] = '外部更新'; };
    result = await session.remove();
    assert.equal(result.deletedCount, 1);
    assert.equal(calls.length, 1, '旧 API 每次写入前重新校验，遇到外部变化停止余下删除');

    session = reset(); session.selectAll();
    afterDelete = () => { alive = false; locks = { rows: [2], cols: [], cells: [] }; };
    result = await session.remove();
    assert.equal(calls.length, 1, '写入期间聊天退役必须停止后续逐行删除');
    assert.deepEqual(locks.rows, [2], '旧聊天提交结果不得重排新聊天锁定位置');
    assert.equal(result.status, 'cancelled');

    session = reset(); session.toggle(0);
    raw.sheet_a.content[1][1] = '外部更新';
    assert.equal(session.sync(raw), true);
    assert.equal(session.active, false, '订阅更新使选择失效');
    console.log('[通过] 底部删除：SQL 与旧 API、倒序、锁定、部分失败、并发数据变化与生命周期');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
