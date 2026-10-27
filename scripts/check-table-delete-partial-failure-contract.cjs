const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    repository: 'modules/phone-core/data-api/table-repository.js',
    rowDelete: 'modules/table-viewer/row-delete-controller.js',
    listController: 'modules/table-viewer/list-page-controller.js',
    theaterDelete: 'modules/phone-theater/delete-service.js',
};

const REMOVED_LEGACY_FILES = [
    'modules/phone-core/chat-support/message-projection.js',
    'modules/table-viewer/special/message-viewer.js',
];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name}`);

    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        index += 1;
    }
    assert(depth === 0, `${name} 函数体括号不平衡`);
    return source.slice(match.index, index);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    for (const token of tokens) {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    }
}

function extractNamedFunction(source, name) {
    return extractFunctionBody(source, name, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
}

function evaluateNamedFunctions(source, names = []) {
    const functionSource = names.map((name) => extractNamedFunction(source, name)).join('\n');
    return Function(`${functionSource}\nreturn { ${names.join(', ')} };`)();
}

function assertRowIndexes(actual, expected, label) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function assertDeleteRowIndexResult(actual, expected, label) {
    for (const field of [
        'requestedRowIndexes',
        'attemptedRowIndexes',
        'deletedRowIndexes',
        'failedRowIndexes',
        'unattemptedRowIndexes',
        'notDeletedRowIndexes',
    ]) {
        assertRowIndexes(actual[field], expected[field], `${label}.${field}`);
    }
}

for (const relativePath of REMOVED_LEGACY_FILES) {
    assert(!fs.existsSync(path.join(root, relativePath)), `旧消息记录表专属模块必须保持删除：${relativePath}`);
}

const sources = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const repositoryBody = extractFunctionBody(
    sources.repository,
    'deleteTableRowsBatch',
    /export\s+async\s+function\s+deleteTableRowsBatch\s*\([^)]*\)\s*{/,
);
assert(sources.repository.includes('function buildBatchDeleteRowIndexResult({'), 'table-repository 必须集中构建批量删除行索引结果');
assert(sources.repository.includes('unattemptedRowIndexes: requested.filter((rowIndex) => !attemptedSet.has(rowIndex)),') , 'table-repository 必须用 requested-attempted 计算未尝试行');
assert(sources.repository.includes('notDeletedRowIndexes: requested.filter((rowIndex) => !deletedSet.has(rowIndex)),') , 'table-repository 必须用 requested-deleted 计算未删除行');
assert(!repositoryBody.includes('failedRowIndexes: normalizedRowIndexes'), 'deleteTableRowsBatch 前置失败不得把 requested 写入 failedRowIndexes');

const legacyDeleteLoopBody = extractFunctionBody(
    sources.repository,
    'deleteRowsViaLegacyDeleteRowLoop',
    /async\s+function\s+deleteRowsViaLegacyDeleteRowLoop\s*\([^)]*\)\s*{/,
);
assertOrdered(legacyDeleteLoopBody, [
    'const attemptedRowIndexes = [];',
    'attemptedRowIndexes.push(uiRowIndex);',
    'failedRowIndexes.push(uiRowIndex);',
    'break;',
    'const batchRowIndexes = buildBatchDeleteRowIndexResult({',
    'attemptedRowIndexes,',
    'deletedRowIndexes,',
    'failedRowIndexes,',
    'const allDeleted = batchRowIndexes.notDeletedRowIndexes.length === 0 && failedRowIndexes.length === 0;',
], 'deleteRowsViaLegacyDeleteRowLoop 必须区分已尝试失败、未尝试和未删除行');

const { buildBatchDeleteRowIndexResult } = evaluateNamedFunctions(
    sources.repository,
    ['normalizeDeleteRowIndexes', 'buildBatchDeleteRowIndexResult'],
);
assertDeleteRowIndexResult(buildBatchDeleteRowIndexResult({ requestedRowIndexes: [1, 2, 3] }), {
    requestedRowIndexes: [3, 2, 1],
    attemptedRowIndexes: [],
    deletedRowIndexes: [],
    failedRowIndexes: [],
    unattemptedRowIndexes: [3, 2, 1],
    notDeletedRowIndexes: [3, 2, 1],
}, 'table-repository 前置失败矩阵');
assertDeleteRowIndexResult(buildBatchDeleteRowIndexResult({
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
}), {
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
    unattemptedRowIndexes: [3],
    notDeletedRowIndexes: [4, 3],
}, 'table-repository 部分失败矩阵');

const rowDeleteBody = extractFunctionBody(
    sources.rowDelete,
    'deleteRowsFromList',
    /const\s+deleteRowsFromList\s*=\s*async\s*\([^)]*\)\s*=>\s*{/,
);
assertOrdered(rowDeleteBody, [
    'const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);',
    'const notDeletedRowIndexes = normalizeRowIndexes(result.notDeletedRowIndexes',
    '|| requestedRowIndexes.filter((rowIndex) => !deletedRowIndexes.includes(rowIndex)));',
    'const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || notDeletedRowIndexes.filter((rowIndex) => !failedRowIndexes.includes(rowIndex)));',
    'const notDeletedViewRowIndexes = remapRemainingRowIndexes(notDeletedRowIndexes, deletedRowIndexes);',
    'state.setSelectedDeleteRowIndexes(notDeletedViewRowIndexes);',
], 'row-delete-controller 必须用未删除集合维护选择状态');

const normalizeDeleteOutcomeBody = extractFunctionBody(
    sources.listController,
    'normalizeDeleteOutcome',
    /function\s+normalizeDeleteOutcome\s*\([^)]*\)\s*{/,
);
assertOrdered(normalizeDeleteOutcomeBody, [
    'const notDeletedRowIndexes = normalizeRowIndexes(',
    'const notDeletedViewRowIndexes = normalizeRowIndexes(result.notDeletedViewRowIndexes || notDeletedRowIndexes);',
    'attemptedRowIndexes: normalizeRowIndexes(result.attemptedRowIndexes || []),',
    'unattemptedRowIndexes,',
    'notDeletedRowIndexes,',
    'notDeletedViewRowIndexes,',
], 'list-page-controller 必须归一化并透传新增行索引字段');
assert(sources.listController.includes('|| deleteOutcome.notDeletedViewRowIndexes.length > 0;'), 'list-page-controller toast 必须使用未删除 view 集合判断部分失败');

const theaterBody = extractFunctionBody(
    sources.theaterDelete,
    'executeTheaterDeletionPlans',
    /async\s+function\s+executeTheaterDeletionPlans\s*\([^)]*\)\s*{/,
);
assertOrdered(theaterBody, [
    'const notDeletedPlans = [',
    '...collectTheaterNotDeletedPlans(results),',
    '...collectUnattemptedTheaterNotDeletedPlans(orderedPlans.slice(planIndex + 1)),',
    'notDeletedPlans,',
    'notDeletedRowsBySheetKey: buildTheaterNotDeletedRowsBySheetKey(notDeletedPlans),',
], 'delete-service 必须归集 Theater 各计划未删除行');
assert(sources.theaterDelete.includes('attempted: false,') && sources.theaterDelete.includes("reason: 'unattempted_after_previous_failure'"), 'delete-service 必须标记 Theater 后续未执行计划');

console.log('[table-delete-partial-failure-contract-check] 检查通过');
console.log('- OK | 通用表批量删除区分 attempted/unattempted/notDeleted');
console.log('- OK | Theater 删除保留未执行计划和未删除行归集');
console.log('- OK | 旧消息记录表 projection 与 special viewer 保持删除');
