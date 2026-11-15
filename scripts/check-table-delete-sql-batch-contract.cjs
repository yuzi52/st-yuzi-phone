const fs = require('fs');
const path = require('path');
const { extractFunctionBody } = require('./helpers/source-functions.cjs');

const ROOT = process.cwd();
const FILES = {
    repository: 'modules/phone-core/data-api/table-repository.js',
    mutationSettlement: 'modules/phone-core/data-api/mutation-settlement.js',
    architectureGuide: 'docs/architecture-guide.md',
    rowDelete: 'modules/table-viewer/row-delete-controller.js',
    theaterDelete: 'modules/phone-theater/delete-service.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function extractNamedFunction(source, name) {
    return extractFunctionBody(source, name, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
}

function evaluateNamedFunctions(source, names = []) {
    const functionSource = names.map((name) => extractNamedFunction(source, name)).join('\n');
    return Function(`${functionSource}\nreturn { ${names.join(', ')} };`)();
}

function assertDeleteDiagnostics(actual, expected, label) {
    for (const [field, value] of Object.entries(expected)) {
        const actualJson = JSON.stringify(actual[field]);
        const expectedJson = JSON.stringify(value);
        assert(actualJson === expectedJson, `${label}.${field} 期望 ${expectedJson}，实际 ${actualJson}`);
    }
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );
    const results = [];
    const sqlMutationDeleteSource = extractNamedFunction(contents.repository, 'tryDeleteRowsViaSqlMutation');

    check(results, 'repository', 'deleteTableRowsBatch 仍通过 enqueueTableMutation 执行', has(contents.repository, "return enqueueTableMutation('deleteTableRowsBatch', async () => {"));
    check(results, 'repository', '仍集中构建批量删除行索引结果', has(contents.repository, 'function buildBatchDeleteRowIndexResult({'));
    check(results, 'repository', '旧 deleteRow fallback helper 存在', has(contents.repository, 'function deleteRowsViaLegacyDeleteRowLoop('));
    check(results, 'repository', 'fallback 仍调用 callDeleteRowApi', has(contents.repository, 'callDeleteRowApi(api, safeTableName, dbRowIndex)'));
    check(results, 'repository', '存在 executeSqlMutation 快路径', has(contents.repository, 'executeSqlMutation'));
    check(results, 'repository', 'SQL 快路径构造单条 DELETE FROM', has(contents.repository, 'DELETE FROM'));
    check(results, 'repository', 'SQL 快路径按 row_id IN 删除', has(contents.repository, 'WHERE row_id IN ('));
    check(results, 'repository', 'SQL 快路径使用参数占位符', has(contents.repository, "Array(rowCount).fill('?').join(', ')"));
    check(results, 'repository', 'rowIndex 必须从 content[rowIndex + 1] 映射 row_id', has(contents.repository, 'content[rowIndex + 1]'));
    check(results, 'repository', '物理表名必须经安全标识符校验', has(contents.repository, 'function isSafeSqlIdentifier('));
    check(results, 'repository', 'SQL partial 已可能写入时不得 fallback', has(contents.repository, 'shouldFallback: false') && has(contents.repository, 'partial_unknown'));
    check(results, 'repository', 'diagnostics 暴露删除策略', has(contents.repository, 'deleteStrategy') && has(contents.repository, 'fallbackReason'));
    check(results, 'repository', 'SQL 快路径有参数上限预检，超限时在执行前 fallback', has(contents.repository, 'const SQL_DELETE_MAX_BOUND_PARAMS = 900;') && has(contents.repository, "fallbackReason: 'sql_param_limit_exceeded'"));
    check(results, 'repository', '只有完整成功且 changes 精确匹配时才能跳过 row_id 对账', has(sqlMutationDeleteSource, 'const changesMatchesRequest = mutationResult.ok && mutationResult.changes === rowIds.length;') && has(sqlMutationDeleteSource, 'const requiresReconciliation = !changesMatchesRequest;') && has(sqlMutationDeleteSource, '} else if (requiresReconciliation) {'));
    check(results, 'repository', '禁止恢复仅对 ok settlement 对账的旧条件', !has(sqlMutationDeleteSource, 'mutationResult.ok && !changesMatchesRequest'));
    check(results, 'repository', '任何需要对账但查询未确认的结果必须 fail-closed', has(sqlMutationDeleteSource, 'const partialUnknown = requiresReconciliation && queryResult?.ok !== true;'));
    check(results, 'repository', 'SQL 快路径导入共享 mutation settlement normalizer', has(contents.repository, "from './mutation-settlement.js';"));
    check(results, 'repository', 'SQL 快路径调用共享 mutation settlement normalizer', has(contents.repository, 'normalizeSqlMutationSettlement(rawResult)'));
    check(results, 'repository', 'repository 不得重新内联私有 SQL mutation normalizer', !has(contents.repository, 'function normalizeSqlDeleteMutationResult('));
    check(results, 'mutationSettlement', '共享 normalizer 识别 ok:false 与 success:false', has(contents.mutationSettlement, "'ok' in result && result.ok === false") && has(contents.mutationSettlement, "'success' in result && result.success === false"));
    check(results, 'mutationSettlement', '共享 normalizer 必须要求正式 errors 数组', has(contents.mutationSettlement, "!('errors' in result) || !Array.isArray(result.errors)"));
    check(results, 'mutationSettlement', '共享 normalizer 的 changes 必须是非负整数', has(contents.mutationSettlement, 'Number.isInteger(result.changes)') && has(contents.mutationSettlement, 'result.changes < 0'));
    check(results, 'repository', '早退分支统一构造批量删除 diagnostics', has(contents.repository, 'function buildDeleteBatchDiagnostics({') && has(contents.repository, 'diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName'));
    check(results, 'repository', '禁止 executeSqlBatch 主路径', !has(contents.repository, 'executeSqlBatch'));
    check(results, 'repository', '禁止 executeSql 自动分流主路径', !has(contents.repository, 'executeSql('));

    const { normalizeDeleteRowIndexes, buildDeleteBatchDiagnostics } = evaluateNamedFunctions(contents.repository, ['normalizeDeleteRowIndexes', 'buildDeleteBatchDiagnostics']);
    assert(JSON.stringify(normalizeDeleteRowIndexes([1, '3', 3, 0, -1, 2.5, 'bad'])) === JSON.stringify([3, 1, 0]), 'normalizeDeleteRowIndexes 必须转换数字字符串、过滤非法索引、去重并降序排列');
    assertDeleteDiagnostics(buildDeleteBatchDiagnostics({ tableName: 'messages', deleteStrategy: 'none', fallbackReason: 'empty_selection', requestedRowIndexes: [1, 3, 3] }), { tableName: 'messages', deleteStrategy: 'none', fallbackReason: 'empty_selection', requestedRowIndexes: [3, 1] }, 'buildDeleteBatchDiagnostics');

    check(results, 'architectureGuide', 'Theater 文档说明 scene 不拼 SQL', has(contents.architectureGuide, '小剧场 scene 只收集删除计划，不拼 SQL。'));
    check(results, 'architectureGuide', 'Theater 文档说明不做跨表 SQL/事务删除', has(contents.architectureGuide, '当前不做跨表单条 SQL，不承诺跨表事务原子性。'));
    check(results, 'theaterDelete', '小剧场仍按表等待 deleteTableRowsBatch 真实完成', has(contents.theaterDelete, 'const result = await deleteTableRowsBatch(plan.tableName, plan.rowIndexes);'));
    check(results, 'theaterDelete', '小剧场不再传递旧 refreshProjection 选项', !has(contents.theaterDelete, 'refreshProjection'));
    check(results, 'rowDelete', '通用表格仍通过 deleteSheetRows 进入仓库层', has(contents.rowDelete, 'const result = await deleteSheetRows(sheetKey, requestedRowIndexes, {'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[table-delete-sql-batch-contract-check] 检查失败：');
        for (const item of failed) console.error(`- ${item.file}: ${item.description}`);
        process.exitCode = 1;
        return;
    }

    console.log('[table-delete-sql-batch-contract-check] 检查通过');
    for (const item of results) console.log(`- OK | ${item.file} | ${item.description}`);
}

main();
