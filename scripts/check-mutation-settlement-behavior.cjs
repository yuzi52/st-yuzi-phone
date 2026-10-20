const { createDeferred: deferred } = require('./helpers/deferred.cjs');
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_TIMEOUT_MS = 5000;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function settlementState(promise, waitMs = 20) {
    return Promise.race([
        Promise.resolve(promise).then(() => 'fulfilled', () => 'rejected'),
        delay(waitMs).then(() => 'pending'),
    ]);
}

function setDatabaseApi(api) {
    global.window = {
        parent: { AutoCardUpdaterAPI: api },
        AutoCardUpdaterAPI: null,
    };
}

async function loadModules() {
    const bridgeUrl = pathToFileURL(path.join(ROOT, 'modules', 'phone-core', 'db-bridge.js')).href;
    const settlementUrl = pathToFileURL(path.join(ROOT, 'modules', 'phone-core', 'data-api', 'mutation-settlement.js')).href;
    const repositoryUrl = pathToFileURL(path.join(ROOT, 'modules', 'phone-core', 'data-api', 'sql-repository.js')).href;
    const queueUrl = pathToFileURL(path.join(ROOT, 'modules', 'phone-core', 'data-api', 'mutation-queue.js')).href;
    return {
        bridge: await import(bridgeUrl),
        settlement: await import(settlementUrl),
        repository: await import(repositoryUrl),
        queue: await import(queueUrl),
    };
}

function assertExplicitFailureContract(result, rawResult, label) {
    assert.strictEqual(result.ok, false, `${label} 必须保持失败`);
    assert.strictEqual(result.changes, null, `${label} 的顶层 changes 必须统一为 null`);
    assert.strictEqual(result.result, rawResult, `${label} 必须保留原始 result 对象`);
    assert.strictEqual(result.result.changes, rawResult.changes, `${label} 必须保留原始 result.changes`);
    assert.ok(Array.isArray(result.errors), `${label} 必须稳定提供 errors 数组`);
    assert.deepStrictEqual(result.errors, rawResult.errors, `${label} 必须保留底层 errors 内容`);
}

function checkSharedSqlMutationSettlement(settlement) {
    const { normalizeSqlMutationSettlement } = settlement;
    assert.strictEqual(typeof normalizeSqlMutationSettlement, 'function', '共享 SQL mutation normalizer 必须导出函数');

    const malformedCases = [
        { value: null, code: 'mutation_result_null' },
        { value: undefined, code: 'mutation_result_invalid' },
        { value: false, code: 'mutation_result_invalid', rawResult: true },
        { value: 'invalid', code: 'mutation_result_invalid', rawResult: true },
        { value: [], code: 'mutation_result_invalid', rawResult: true },
        { value: {}, code: 'mutation_result_invalid', result: true },
        { value: { saved: true }, code: 'mutation_result_invalid', result: true },
        { value: { success: true }, code: 'mutation_result_invalid', result: true },
        { value: { changes: 0 }, code: 'mutation_result_invalid', result: true },
        { value: { errors: [] }, code: 'mutation_result_invalid', result: true },
        { value: { changes: 0, errors: 'invalid' }, code: 'mutation_result_invalid', result: true },
        { value: { changes: '1', errors: [] }, code: 'mutation_result_invalid', result: true },
        { value: { changes: Number.NaN, errors: [] }, code: 'mutation_result_invalid', result: true },
        { value: { changes: Number.POSITIVE_INFINITY, errors: [] }, code: 'mutation_result_invalid', result: true },
        { value: { changes: -1, errors: [] }, code: 'mutation_result_invalid', result: true },
        { value: { changes: 1.5, errors: [] }, code: 'mutation_result_invalid', result: true },
    ];

    for (const testCase of malformedCases) {
        const result = normalizeSqlMutationSettlement(testCase.value);
        assert.strictEqual(result.ok, false, `共享 normalizer 不得接受畸形结果：${String(testCase.value)}`);
        assert.strictEqual(result.code, testCase.code);
        assert.strictEqual(result.changes, null, '失败 settlement 的 changes 必须统一为 null');
        assert.ok(Array.isArray(result.errors), '失败 settlement 必须稳定提供 errors 数组');
        if (testCase.result) assert.strictEqual(result.result, testCase.value, '对象原始结果必须保留在 result');
        if (testCase.rawResult) assert.strictEqual(result.rawResult, testCase.value, '非对象原始结果必须保留在 rawResult');
    }

    const error = new Error('sql failed');
    const errorResult = { changes: 0, errors: [error], message: '底层写入失败' };
    const failed = normalizeSqlMutationSettlement(errorResult);
    assertExplicitFailureContract(failed, errorResult, 'errors 非空 settlement');
    assert.strictEqual(failed.code, 'mutation_failed');
    assert.strictEqual(failed.message, '底层写入失败');

    const saveFailureResult = { changes: 0, errors: [], saved: false, message: '保存未完成' };
    const saveFailed = normalizeSqlMutationSettlement(saveFailureResult);
    assertExplicitFailureContract(saveFailed, saveFailureResult, 'saved:false settlement');
    assert.strictEqual(saveFailed.code, 'save_failed');
    assert.strictEqual(saveFailed.message, '保存未完成');

    const explicitFailureResult = {
        ok: false,
        code: 'db_declined',
        message: '数据库拒绝写入',
        changes: 0,
        errors: [],
    };
    const explicitFailure = normalizeSqlMutationSettlement(explicitFailureResult);
    assertExplicitFailureContract(explicitFailure, explicitFailureResult, 'ok:false settlement');
    assert.strictEqual(explicitFailure.code, 'db_declined', 'ok:false 必须保留底层非 ok code');
    assert.strictEqual(explicitFailure.message, '数据库拒绝写入', 'ok:false 必须保留底层 message');

    const successFailureResult = {
        success: false,
        code: 'transaction_aborted',
        message: '事务已中止',
        changes: 0,
        errors: [],
    };
    const successFailure = normalizeSqlMutationSettlement(successFailureResult);
    assertExplicitFailureContract(successFailure, successFailureResult, 'success:false settlement');
    assert.strictEqual(successFailure.code, 'transaction_aborted', 'success:false 必须保留底层非 ok code');
    assert.strictEqual(successFailure.message, '事务已中止', 'success:false 必须保留底层 message');

    for (const rawResult of [
        { ok: false, code: 'ok', changes: 0, errors: [] },
        { success: false, code: 'ok', changes: 0, errors: [] },
    ]) {
        const misleadingCode = normalizeSqlMutationSettlement(rawResult);
        assertExplicitFailureContract(misleadingCode, rawResult, 'code:ok 显式失败 settlement');
        assert.strictEqual(misleadingCode.code, 'mutation_failed', '显式失败不得继续暴露 code=ok');
    }

    const success = normalizeSqlMutationSettlement({ changes: 0, errors: [] });
    assert.strictEqual(success.ok, true, 'changes=0 且 errors=[] 必须是合法 settlement');
    assert.strictEqual(success.code, 'ok');
    assert.strictEqual(success.changes, 0, 'changes=0 必须原样保留');
    assert.deepStrictEqual(success.errors, []);
}

async function checkHelperWaitsPastLegacyTimeout(bridge) {
    const pendingWrite = deferred();
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);

    try {
        const startedAt = Date.now();
        const call = bridge.callMutationApiToSettlement(
            () => pendingWrite.promise,
            'settlementTest',
            { watchdogMs: 10 },
        );
        setTimeout(() => pendingWrite.resolve({ saved: true, success: true, changes: 1, errors: [] }), LEGACY_TIMEOUT_MS + 80);

        assert.strictEqual(await settlementState(call, 30), 'pending', 'watchdog 到时不得让 mutation 提前 settle');
        const result = await call;
        assert.ok(Date.now() - startedAt > LEGACY_TIMEOUT_MS, 'mutation 必须能等待超过旧 5 秒 hard timeout');
        assert.strictEqual(result.changes, 1, '超过 5 秒后的真实成功结果必须原样返回');

        const watchdogLogs = warnings.filter(args => String(args[0] || '').includes('[settlementTest.mutation_pending_long]'));
        assert.strictEqual(watchdogLogs.length, 1, '慢 mutation 的 watchdog 日志必须只记录一次');
    } finally {
        console.warn = originalWarn;
    }
}

async function checkHelperRejectAndNullSemantics(bridge) {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);

    try {
        const lateFailure = deferred();
        const expectedError = new Error('late mutation rejection');
        const rejectedCall = bridge.callMutationApiToSettlement(
            () => lateFailure.promise,
            'lateRejectTest',
            { watchdogMs: 5 },
        );

        assert.strictEqual(await settlementState(rejectedCall, 15), 'pending', '晚到 reject 前 mutation 必须保持 pending');
        lateFailure.reject(expectedError);
        await assert.rejects(rejectedCall, error => error === expectedError, 'helper 必须重新抛出原始 Promise reject');

        const syncError = new Error('sync mutation exception');
        await assert.rejects(
            bridge.callMutationApiToSettlement(() => { throw syncError; }, 'syncThrowTest', { watchdogMs: 10 }),
            error => error === syncError,
            'helper 必须重新抛出原始同步异常',
        );
        assert.strictEqual(
            await bridge.callMutationApiToSettlement(() => null, 'nullResultTest', { watchdogMs: 10 }),
            null,
            '真实 null 必须由 helper 原样返回',
        );

        assert.strictEqual(
            warnings.filter(args => String(args[0] || '').includes('[lateRejectTest.mutation_reject]')).length,
            1,
            'Promise reject 必须记录一次 mutation_reject',
        );
        assert.strictEqual(
            warnings.filter(args => String(args[0] || '').includes('[syncThrowTest.mutation_exception]')).length,
            1,
            '同步异常必须记录一次 mutation_exception',
        );
    } finally {
        console.warn = originalWarn;
    }
}

async function checkSqlMutationErrorCodes(repository) {
    setDatabaseApi(null);
    assert.strictEqual((await repository.executeSqlMutationViaApi('UPDATE t SET a = 1')).code, 'api_unavailable');

    setDatabaseApi({});
    assert.strictEqual((await repository.executeSqlMutationViaApi('UPDATE t SET a = 1')).code, 'method_missing');

    const rejectedError = new Error('db rejected');
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        setDatabaseApi({ executeSqlMutation: () => Promise.reject(rejectedError) });
        const rejected = await repository.executeSqlMutationViaApi('UPDATE t SET a = 1');
        assert.strictEqual(rejected.code, 'mutation_rejected');
        assert.strictEqual(rejected.errors[0], rejectedError, 'mutation_rejected 必须保留原始错误');
    } finally {
        console.warn = originalWarn;
    }

    const resultCases = [
        { value: null, code: 'mutation_result_null' },
        { value: undefined, code: 'mutation_result_invalid' },
        { value: false, code: 'mutation_result_invalid' },
        { value: 'invalid', code: 'mutation_result_invalid' },
        { value: [], code: 'mutation_result_invalid' },
        { value: {}, code: 'mutation_result_invalid' },
        { value: { saved: true }, code: 'mutation_result_invalid' },
        { value: { success: true }, code: 'mutation_result_invalid' },
        { value: { changes: 0 }, code: 'mutation_result_invalid' },
        { value: { errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: 0, errors: 'invalid' }, code: 'mutation_result_invalid' },
        { value: { changes: '1', errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: Number.NaN, errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: Number.POSITIVE_INFINITY, errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: -1, errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: 1.5, errors: [] }, code: 'mutation_result_invalid' },
        { value: { changes: 0, errors: [new Error('sql failed')] }, code: 'mutation_failed', failureContract: true },
        { value: { changes: 0, errors: [], success: false }, code: 'mutation_failed', failureContract: true },
        { value: { changes: 0, errors: [], saved: false }, code: 'save_failed', failureContract: true },
        {
            value: { changes: 0, errors: [], ok: false, code: 'db_declined', message: '数据库拒绝写入' },
            code: 'db_declined',
            message: '数据库拒绝写入',
            failureContract: true,
        },
        { value: { changes: 0, errors: [], ok: false, code: 'ok' }, code: 'mutation_failed', failureContract: true },
        { value: { changes: 0, errors: [], success: false, code: 'ok' }, code: 'mutation_failed', failureContract: true },
    ];

    for (const testCase of resultCases) {
        setDatabaseApi({ executeSqlMutation: () => testCase.value });
        const result = await repository.executeSqlMutationViaApi('UPDATE t SET a = 1');
        assert.strictEqual(result.code, testCase.code, `mutation 返回 ${String(testCase.value)} 时错误码应为 ${testCase.code}`);
        if (testCase.message) assert.strictEqual(result.message, testCase.message, 'repository 必须保留底层失败 message');
        if (testCase.failureContract) {
            assertExplicitFailureContract(result, testCase.value, `repository ${testCase.code}`);
        }
    }

    setDatabaseApi({ executeSqlMutation: () => ({ changes: 0, errors: [] }) });
    const success = await repository.executeSqlMutationViaApi('UPDATE t SET a = 1');
    assert.strictEqual(success.ok, true, 'changes=0 仍然是已确认成功的 mutation');
    assert.strictEqual(success.changes, 0, 'changes=0 必须原样保留');
}

async function checkQueueUsesRealSettlement(repository, queue) {
    const firstWrite = deferred();
    const calls = [];
    setDatabaseApi({
        executeSqlMutation(sql) {
            calls.push(sql);
            if (calls.length === 1) return firstWrite.promise;
            return { saved: true, success: true, changes: 1, errors: [] };
        },
    });

    const first = repository.executeSqlMutationViaApi('UPDATE t SET a = 1');
    const second = repository.executeSqlMutationViaApi('UPDATE t SET a = 2');
    await delay(25);
    assert.deepStrictEqual(calls, ['UPDATE t SET a = 1'], '第一项真实 settle 前，第二项不得调用底层 API');
    assert.strictEqual(queue.getPendingTableMutationCount(), 2, '队列 pending count 必须包含运行中和等待中的 mutation');

    firstWrite.resolve({ saved: true, success: true, changes: 1, errors: [] });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.strictEqual(firstResult.ok, true);
    assert.strictEqual(secondResult.ok, true);
    assert.deepStrictEqual(calls, ['UPDATE t SET a = 1', 'UPDATE t SET a = 2']);
    assert.strictEqual(queue.getPendingTableMutationCount(), 0, '真实 settlement 后队列计数必须归零');
}

async function checkQueueWaitsForLateReject(repository, queue) {
    const lateFailure = deferred();
    const expectedError = new Error('queued late rejection');
    const calls = [];
    setDatabaseApi({
        executeSqlMutation(sql) {
            calls.push(sql);
            if (calls.length === 1) return lateFailure.promise;
            return { saved: true, success: true, changes: 1, errors: [] };
        },
    });

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const first = repository.executeSqlMutationViaApi('UPDATE t SET a = 3');
        const second = repository.executeSqlMutationViaApi('UPDATE t SET a = 4');
        await delay(25);
        assert.deepStrictEqual(calls, ['UPDATE t SET a = 3'], '晚到 reject 真正发生前，下一项不得调用底层 API');

        lateFailure.reject(expectedError);
        const [firstResult, secondResult] = await Promise.all([first, second]);
        assert.strictEqual(firstResult.code, 'mutation_rejected', '晚到 reject 必须映射为 mutation_rejected');
        assert.strictEqual(firstResult.errors[0], expectedError, '队列 mutation 必须保留晚到的原始 reject');
        assert.strictEqual(secondResult.ok, true, '前一项真实 reject 后，队列必须继续执行下一项');
        assert.deepStrictEqual(calls, ['UPDATE t SET a = 3', 'UPDATE t SET a = 4']);
        assert.strictEqual(queue.getPendingTableMutationCount(), 0, '晚到 reject 与后续成功 settle 后队列计数必须归零');
    } finally {
        console.warn = originalWarn;
    }
}

async function checkHungMutationKeepsQueueClosed(bridge, queue) {
    const neverSettles = new Promise(() => {});
    let secondTaskCalls = 0;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);

    try {
        const first = queue.enqueueTableMutation(
            'hung-settlement-test',
            () => bridge.callMutationApiToSettlement(() => neverSettles, 'hungSettlementTest', { watchdogMs: 5 }),
        );
        const second = queue.enqueueTableMutation('blocked-after-hung-test', async () => {
            secondTaskCalls += 1;
            return true;
        });

        await delay(25);
        assert.strictEqual(await settlementState(first, 5), 'pending', '永久 pending 的底层 mutation 不得被 watchdog 结算');
        assert.strictEqual(await settlementState(second, 5), 'pending', '永久 pending mutation 后的队列任务必须保持阻塞');
        assert.strictEqual(secondTaskCalls, 0, '队列阻塞期间不得执行第二项 task');
        assert.strictEqual(queue.getPendingTableMutationCount(), 2, 'hung queue 必须保持 fail-closed 的 pending 状态');
        assert.strictEqual(
            warnings.filter(args => String(args[0] || '').includes('[hungSettlementTest.mutation_pending_long]')).length,
            1,
            '永久 pending mutation 的 watchdog 也只能记录一次',
        );
    } finally {
        console.warn = originalWarn;
    }
}

async function main() {
    const { bridge, settlement, repository, queue } = await loadModules();
    checkSharedSqlMutationSettlement(settlement);
    await checkHelperWaitsPastLegacyTimeout(bridge);
    await checkHelperRejectAndNullSemantics(bridge);
    await checkSqlMutationErrorCodes(repository);
    await checkQueueUsesRealSettlement(repository, queue);
    await checkQueueWaitsForLateReject(repository, queue);
    await checkHungMutationKeepsQueueClosed(bridge, queue);
    console.log('[mutation-settlement-behavior-check] 检查通过：>5s、watchdog、late success/reject、错误分型与 hung queue 均符合真实 settlement 契约');
}

main().catch((error) => {
    console.error('[mutation-settlement-behavior-check] 检查失败：', error);
    process.exitCode = 1;
});
