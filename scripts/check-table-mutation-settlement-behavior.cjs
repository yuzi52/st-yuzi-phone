const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function moduleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function setApi(api) {
    global.window = {
        parent: { AutoCardUpdaterAPI: api },
        AutoCardUpdaterAPI: null,
    };
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSqlDeleteSnapshot(rowIds = [7]) {
    return {
        sheet_1: {
            name: '测试表',
            content: [
                ['row_id', '内容'],
                ...rowIds.map((rowId) => [rowId, `记录${rowId}`]),
            ],
            sourceData: { ddl: 'CREATE TABLE test_table (row_id INTEGER PRIMARY KEY, content TEXT)' },
        },
    };
}

function createSqlQueryResult(rowIds = [], overrides = {}) {
    const normalizedRowIds = rowIds.map((rowId) => Number(rowId));
    return {
        columns: ['row_id'],
        values: normalizedRowIds.map((rowId) => [rowId]),
        rowCount: normalizedRowIds.length,
        rows: normalizedRowIds.map((rowId) => ({ row_id: rowId })),
        ...overrides,
    };
}

function createSqlDeleteApi({
    rowIds = [7],
    mutationResult,
    queryResult,
    includeMutation = true,
    includeSnapshot = true,
    includeQuery = true,
} = {}) {
    const calls = {
        mutation: 0,
        query: 0,
        deleteRow: 0,
        mutationArgs: [],
        queryArgs: [],
        deleteRowArgs: [],
    };
    const api = {};
    if (includeSnapshot) {
        api.exportTableAsJson = () => {
            return createSqlDeleteSnapshot(rowIds);
        };
    }
    if (includeMutation) {
        api.executeSqlMutation = (sql, params) => {
            calls.mutation += 1;
            calls.mutationArgs.push({ sql, params: Array.isArray(params) ? [...params] : params });
            return mutationResult instanceof Error ? Promise.reject(mutationResult) : mutationResult;
        };
    }
    if (includeQuery) {
        api.querySql = (sql, params) => {
            calls.query += 1;
            calls.queryArgs.push({ sql, params: Array.isArray(params) ? [...params] : params });
            return queryResult instanceof Error ? Promise.reject(queryResult) : queryResult;
        };
    }
    api.deleteRow = (tableName, rowIndex) => {
        calls.deleteRow += 1;
        calls.deleteRowArgs.push({ tableName, rowIndex });
        return true;
    };
    return { api, calls };
}

async function checkSqlDeleteSettlementBehavior(repository) {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const mutationError = new Error('底层删除失败');
        const settlementCases = [
            {
                name: 'changes=0 结构成功',
                mutationResult: { changes: 0, errors: [] },
                mutationCode: 'ok',
                confirmedFailureCode: 'mutation_failed',
                mutationOk: true,
            },
            {
                name: 'changes 超出请求数',
                mutationResult: { changes: 2, errors: [] },
                mutationCode: 'ok',
                confirmedFailureCode: 'mutation_failed',
                mutationOk: true,
            },
            {
                name: 'errors 非空且 changes 匹配',
                mutationResult: { changes: 1, errors: [mutationError], message: '底层删除失败' },
                mutationCode: 'mutation_failed',
                confirmedFailureCode: 'mutation_failed',
                confirmedFailureMessage: '底层删除失败',
                mutationOk: false,
            },
            {
                name: 'saved=false 且 changes 匹配',
                mutationResult: { changes: 1, errors: [], saved: false, message: '保存失败' },
                mutationCode: 'save_failed',
                confirmedFailureCode: 'save_failed',
                confirmedFailureMessage: '保存失败',
                mutationOk: false,
            },
            {
                name: 'ok=false 且 changes 匹配',
                mutationResult: {
                    ok: false,
                    code: 'db_declined',
                    message: '数据库拒绝删除',
                    changes: 1,
                    errors: [],
                },
                mutationCode: 'db_declined',
                confirmedFailureCode: 'db_declined',
                confirmedFailureMessage: '数据库拒绝删除',
                mutationOk: false,
            },
            {
                name: 'success=false 且 changes 匹配',
                mutationResult: {
                    success: false,
                    code: 'transaction_aborted',
                    message: '事务中止',
                    changes: 1,
                    errors: [],
                },
                mutationCode: 'transaction_aborted',
                confirmedFailureCode: 'transaction_aborted',
                confirmedFailureMessage: '事务中止',
                mutationOk: false,
            },
            {
                name: 'null settlement',
                mutationResult: null,
                mutationCode: 'mutation_result_null',
                confirmedFailureCode: 'mutation_result_null',
                mutationOk: false,
            },
            {
                name: 'undefined settlement',
                mutationResult: undefined,
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: 'boolean primitive settlement',
                mutationResult: false,
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: 'string primitive settlement',
                mutationResult: 'invalid',
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: 'array settlement',
                mutationResult: [],
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: '缺少 errors',
                mutationResult: { changes: 1 },
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: '非法 changes',
                mutationResult: { changes: '1', errors: [] },
                mutationCode: 'mutation_result_invalid',
                confirmedFailureCode: 'mutation_result_invalid',
                mutationOk: false,
            },
            {
                name: 'Promise reject',
                mutationResult: new Error('sql rejected after dispatch'),
                mutationCode: 'mutation_rejected',
                confirmedFailureCode: 'mutation_rejected',
                confirmedFailureMessage: 'sql rejected after dispatch',
                mutationOk: false,
            },
        ];

        for (const testCase of settlementCases) {
            let scenario = createSqlDeleteApi({
                mutationResult: testCase.mutationResult,
                queryResult: createSqlQueryResult([]),
            });
            setApi(scenario.api);
            let result = await repository.deleteTableRowsBatch('测试表', [0]);
            assert.equal(result.ok, true, testCase.name + '：对账确认全部 row_id 消失时必须成功');
            assert.equal(result.code, 'ok', testCase.name + '：全部删除后 code 必须为 ok');
            assert.equal(result.deletedCount, 1);
            assert.deepEqual(result.deletedRowIndexes, [0]);
            assert.deepEqual(result.failedRowIndexes, []);
            assert.deepEqual(result.notDeletedRowIndexes, []);
            assert.equal(result.refreshed, testCase.mutationOk, testCase.name + '：refreshed 必须反映原 mutation 是否完成正式副作用');
            assert.equal(result.diagnostics.reconciliationRequired, true);
            assert.equal(result.diagnostics.queryConfirmed, true);
            assert.equal(result.diagnostics.mutationCode, testCase.mutationCode);
            assert.equal(scenario.calls.mutation, 1);
            assert.equal(scenario.calls.query, 1);
            assert.equal(scenario.calls.deleteRow, 0, testCase.name + '：SQL 发出后不得 fallback 到 deleteRow');
            assert.match(scenario.calls.mutationArgs[0].sql, /^DELETE FROM test_table WHERE row_id IN \(\?\)$/);
            assert.deepEqual(scenario.calls.mutationArgs[0].params, [7]);
            assert.match(scenario.calls.queryArgs[0].sql, /^SELECT row_id FROM test_table WHERE row_id IN \(\?\)$/);
            assert.deepEqual(scenario.calls.queryArgs[0].params, [7]);

            scenario = createSqlDeleteApi({
                mutationResult: testCase.mutationResult,
                queryResult: createSqlQueryResult([7]),
            });
            setApi(scenario.api);
            result = await repository.deleteTableRowsBatch('测试表', [0]);
            assert.equal(result.ok, false, testCase.name + '：对账确认目标仍存在时必须失败');
            assert.equal(result.code, testCase.confirmedFailureCode);
            if (testCase.confirmedFailureMessage) {
                assert.equal(result.message, testCase.confirmedFailureMessage, testCase.name + '：必须保留底层失败 message');
            }
            assert.equal(result.deletedCount, 0);
            assert.deepEqual(result.deletedRowIndexes, []);
            assert.deepEqual(result.failedRowIndexes, [0]);
            assert.deepEqual(result.notDeletedRowIndexes, [0]);
            assert.equal(result.diagnostics.reconciliationRequired, true);
            assert.equal(result.diagnostics.queryConfirmed, true);
            assert.equal(result.diagnostics.mutationCode, testCase.mutationCode);
            assert.equal(scenario.calls.mutation, 1);
            assert.equal(scenario.calls.query, 1);
            assert.equal(scenario.calls.deleteRow, 0, testCase.name + '：确认零删除后也不得 fallback');

            scenario = createSqlDeleteApi({
                mutationResult: testCase.mutationResult,
                includeQuery: false,
            });
            // SQL is available at preflight, then disappears after the mutation is dispatched.
            Object.defineProperty(scenario.api, 'querySql', {
                get: () => scenario.calls.mutation === 0 ? () => null : undefined,
            });
            setApi(scenario.api);
            result = await repository.deleteTableRowsBatch('测试表', [0]);
            assert.equal(result.ok, false, testCase.name + '：SQL 发出后失去对账 API 时不能猜测成功');
            assert.equal(result.code, 'partial_unknown');
            assert.deepEqual(result.deletedRowIndexes, []);
            assert.deepEqual(result.failedRowIndexes, []);
            assert.deepEqual(result.notDeletedRowIndexes, [0]);
            assert.equal(result.diagnostics.reconciliationRequired, true);
            assert.equal(result.diagnostics.queryConfirmed, false);
            assert.equal(result.diagnostics.mutationCode, testCase.mutationCode);
            assert.equal(scenario.calls.mutation, 1);
            assert.equal(scenario.calls.query, 0);
            assert.equal(scenario.calls.deleteRow, 0, testCase.name + '：对账能力缺失时不得 fallback');
        }

        let scenario = createSqlDeleteApi({
            mutationResult: { changes: 1, errors: [] },
            queryResult: { malformed: true },
        });
        setApi(scenario.api);
        let result = await repository.deleteTableRowsBatch('测试表', [0]);
        assert.equal(result.ok, true, '只有 mutation ok 且 changes 精确匹配时可以直接确认成功');
        assert.equal(result.code, 'ok');
        assert.equal(result.refreshed, true);
        assert.equal(result.diagnostics.reconciliationRequired, false);
        assert.equal(result.diagnostics.queryConfirmed, false);
        assert.equal(scenario.calls.mutation, 1);
        assert.equal(scenario.calls.query, 0, '完整成功不得执行多余对账');
        assert.equal(scenario.calls.deleteRow, 0);

        const queryFailureCases = [
            { name: 'query reject', queryResult: new Error('reconciliation rejected') },
            { name: 'query null', queryResult: null },
            { name: 'query undefined', queryResult: undefined },
            { name: 'query array', queryResult: [] },
            { name: 'query primitive', queryResult: 'invalid' },
            { name: 'query empty object', queryResult: {} },
            {
                name: 'query missing rows',
                queryResult: { columns: ['row_id'], values: [], rowCount: 0 },
            },
            {
                name: 'query missing values',
                queryResult: { columns: ['row_id'], rows: [], rowCount: 0 },
            },
            {
                name: 'query count mismatch',
                queryResult: { columns: ['row_id'], values: [], rows: [], rowCount: 1 },
            },
            {
                name: 'query errors invalid',
                queryResult: createSqlQueryResult([], { errors: 'invalid' }),
            },
            {
                name: 'query errors non-empty',
                queryResult: createSqlQueryResult([], { errors: [new Error('query failed')] }),
            },
            {
                name: 'query saved=false',
                queryResult: createSqlQueryResult([], { saved: false }),
            },
            {
                name: 'query ok=false',
                queryResult: createSqlQueryResult([], { ok: false }),
            },
            {
                name: 'query success=false',
                queryResult: createSqlQueryResult([], { success: false }),
            },
            {
                name: 'query invalid row_id',
                queryResult: {
                    columns: ['row_id'],
                    values: [['bad']],
                    rowCount: 1,
                    rows: [{ row_id: 'bad' }],
                },
            },
            {
                name: 'query duplicate row_id',
                queryResult: createSqlQueryResult([7, 7]),
            },
            {
                name: 'query unrelated row_id',
                queryResult: createSqlQueryResult([99]),
            },
        ];

        for (const testCase of queryFailureCases) {
            scenario = createSqlDeleteApi({
                mutationResult: { changes: 0, errors: [] },
                queryResult: testCase.queryResult,
            });
            setApi(scenario.api);
            result = await repository.deleteTableRowsBatch('测试表', [0]);
            assert.equal(result.ok, false, testCase.name + '：畸形或失败查询不得被当成全部删除');
            assert.equal(result.code, 'partial_unknown');
            assert.equal(result.diagnostics.reconciliationRequired, true);
            assert.equal(result.diagnostics.queryConfirmed, false);
            assert.equal(scenario.calls.query, 1);
            assert.equal(scenario.calls.deleteRow, 0, testCase.name + '：查询未知不得 fallback');
        }

        scenario = createSqlDeleteApi({
            rowIds: [7, 8],
            mutationResult: { changes: 1, errors: [] },
            queryResult: createSqlQueryResult([8]),
        });
        setApi(scenario.api);
        result = await repository.deleteTableRowsBatch('测试表', [0, 1]);
        assert.equal(result.ok, false, 'changes 数量不一致且只删除部分目标时必须报告部分失败');
        assert.equal(result.code, 'partial_failed');
        assert.equal(result.deletedCount, 1);
        assert.equal(result.refreshed, true);
        assert.deepEqual(result.deletedRowIndexes, [0]);
        assert.deepEqual(result.failedRowIndexes, [1]);
        assert.deepEqual(result.notDeletedRowIndexes, [1]);
        assert.equal(scenario.calls.query, 1);
        assert.equal(scenario.calls.deleteRow, 0);

        scenario = createSqlDeleteApi({
            rowIds: [7, 8],
            mutationResult: {
                ok: false,
                code: 'db_declined',
                message: '数据库拒绝删除',
                changes: 2,
                errors: [],
            },
            queryResult: createSqlQueryResult([8]),
        });
        setApi(scenario.api);
        result = await repository.deleteTableRowsBatch('测试表', [0, 1]);
        assert.equal(result.ok, false, '显式失败后对账确认部分删除仍必须返回 partial_failed');
        assert.equal(result.code, 'partial_failed');
        assert.equal(result.refreshed, false);
        assert.deepEqual(result.deletedRowIndexes, [0]);
        assert.deepEqual(result.failedRowIndexes, [1]);
        assert.equal(scenario.calls.query, 1);
        assert.equal(scenario.calls.deleteRow, 0);

        scenario = createSqlDeleteApi({
            includeMutation: false,
            queryResult: createSqlQueryResult([]),
        });
        setApi(scenario.api);
        result = await repository.deleteTableRowsBatch('测试表', [0]);
        assert.equal(result.ok, true, 'executeSqlMutation 缺失时 SQL 尚未发出，允许 legacy fallback');
        assert.equal(result.code, 'ok');
        assert.equal(result.deleteStrategy, 'legacy_deleteRow_loop');
        assert.equal(result.fallbackReason, 'executeSqlMutation_missing');
        assert.equal(scenario.calls.mutation, 0);
        assert.equal(scenario.calls.query, 0);
        assert.equal(scenario.calls.deleteRow, 1);
        assert.deepEqual(scenario.calls.deleteRowArgs, [{ tableName: '测试表', rowIndex: 1 }]);

        scenario = createSqlDeleteApi({
            includeSnapshot: false,
            mutationResult: { changes: 1, errors: [] },
            queryResult: createSqlQueryResult([]),
        });
        setApi(scenario.api);
        result = await repository.deleteTableRowsBatch('测试表', [0]);
        assert.equal(result.ok, true, '快照 API 缺失时 SQL 尚未发出，允许 legacy fallback');
        assert.equal(result.code, 'ok');
        assert.equal(result.deleteStrategy, 'legacy_deleteRow_loop');
        assert.equal(result.fallbackReason, 'snapshot_api_missing');
        assert.equal(scenario.calls.mutation, 0);
        assert.equal(scenario.calls.query, 0);
        assert.equal(scenario.calls.deleteRow, 1);
    } finally {
        console.warn = originalWarn;
    }
}

async function main() {
    setApi(null);
    const repository = await import(moduleUrl('modules/phone-core/data-api/table-repository.js'));
    const importExport = await import(moduleUrl('modules/phone-core/data-api/import-export-repository.js'));
    const queue = await import(moduleUrl('modules/phone-core/data-api/mutation-queue.js'));

    const firstMutation = createDeferred();
    const mutationEvents = [];
    let duplicateRefreshCalls = 0;
    setApi({
        updateCell() {
            mutationEvents.push('updateCell:start');
            return firstMutation.promise;
        },
        updateRow() {
            mutationEvents.push('updateRow:start');
            return true;
        },
        refreshDataAndWorldbook() {
            duplicateRefreshCalls += 1;
            return true;
        },
    });

    const firstPromise = repository.updateTableCell('测试表', 1, '内容', 'A');
    const secondPromise = repository.updateTableRow('测试表', 1, { 内容: 'B' });
    await wait(15);
    assert.deepEqual(mutationEvents, ['updateCell:start'], '后续 CRUD 必须等待前一写入真实 settle');
    assert.equal(queue.getPendingTableMutationCount(), 2, '慢写期间队列必须保留当前和后续任务');

    firstMutation.resolve(true);
    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(firstResult.ok, true);
    assert.equal(firstResult.refreshed, true, 'refreshed=true 表示底层 mutation Promise 已完成一致性流程');
    assert.equal(secondResult.ok, true);
    assert.deepEqual(mutationEvents, ['updateCell:start', 'updateRow:start']);
    assert.equal(duplicateRefreshCalls, 0, '正常 CRUD 成功后不得调用手机端第二次 refresh');
    assert.equal(queue.getPendingTableMutationCount(), 0);

    setApi({ updateCell: () => null });
    assert.equal((await repository.updateTableCell('测试表', 1, '内容', 'A')).code, 'mutation_result_null');
    setApi({ updateCell: () => undefined });
    assert.equal((await repository.updateTableCell('测试表', 1, '内容', 'A')).code, 'mutation_result_invalid');
    setApi({ updateCell: () => false });
    assert.equal((await repository.updateTableCell('测试表', 1, '内容', 'A')).code, 'mutation_failed');
    setApi({ updateCell: () => Promise.reject(new Error('update rejected')) });
    assert.equal((await repository.updateTableCell('测试表', 1, '内容', 'A')).code, 'mutation_rejected');

    const slowInsert = createDeferred();
    let insertCallCount = 0;
    const rollbackIndexes = [];
    setApi({
        insertRow() {
            insertCallCount += 1;
            return insertCallCount === 1 ? slowInsert.promise : false;
        },
        deleteRow(_tableName, rowIndex) {
            rollbackIndexes.push(rowIndex);
            return true;
        },
    });

    const batchPromise = repository.insertTableRowsBatch(
        '测试表',
        [{ 内容: '第一行' }, { 内容: '第二行' }],
        { insertTimeoutMs: 5 },
    );
    let batchSettled = false;
    batchPromise.finally(() => { batchSettled = true; });
    await wait(15);
    assert.equal(batchSettled, false, '批量插入不得被旧 insertTimeoutMs 提前结束');
    assert.deepEqual(rollbackIndexes, [], '尚未确认第一行结果前不得启动回滚');

    slowInsert.resolve(1);
    const batchResult = await batchPromise;
    assert.equal(batchResult.ok, false);
    assert.equal(batchResult.failureCode, 'mutation_failed');
    assert.equal(batchResult.code, 'mutation_failed_rolled_back');
    assert.deepEqual(batchResult.rowIndexes, [1]);
    assert.deepEqual(rollbackIndexes, [1], '只回滚已确认成功的插入行');
    assert.equal(batchResult.rollback.ok, true);

    await checkSqlDeleteSettlementBehavior(repository);

    const queueGate = createDeferred();
    let explicitRefreshCalls = 0;
    setApi({
        updateCell: () => queueGate.promise,
        refreshDataAndWorldbook() {
            explicitRefreshCalls += 1;
            return true;
        },
    });
    const queuedWrite = repository.updateTableCell('测试表', 1, '内容', 'C');
    const queuedRefresh = importExport.refreshDatabaseProjectionViaApi();
    await wait(15);
    assert.equal(explicitRefreshCalls, 0, '显式 refresh 也必须等待共享队列前序写入真实 settle');
    queueGate.resolve(true);
    const [, refreshResult] = await Promise.all([queuedWrite, queuedRefresh]);
    assert.equal(refreshResult.ok, true);
    assert.equal(explicitRefreshCalls, 1);

    console.log('[table-mutation-settlement-behavior-check] 检查通过');
}

main().catch((error) => {
    console.error('[table-mutation-settlement-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
