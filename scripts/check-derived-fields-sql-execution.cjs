const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const CHRONICLE_SQL_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation-sql.js');
const CALENDAR_SQL_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'small-calendar-derived-fields-sql.js');

function loadSqlite() {
    try {
        return require('node:sqlite');
    } catch {
        return null;
    }
}

function rebindDeclaredTables(sql, replacements) {
    return replacements.reduce((result, [logicalName, physicalName]) => result
        .replaceAll(`FROM ${logicalName}`, `FROM ${physicalName}`)
        .replaceAll(`UPDATE ${logicalName}`, `UPDATE ${physicalName}`), sql);
}

function readRows(db, sql) {
    return db.prepare(sql).all().map((row) => ({ ...row }));
}

function seedChronicle(db, tableNames) {
    db.exec(`
        CREATE TABLE ${tableNames.anchor} (
            row_id INTEGER PRIMARY KEY,
            cur_time TEXT NOT NULL
        );
        CREATE TABLE ${tableNames.chronicle} (
            row_id INTEGER PRIMARY KEY,
            time_span TEXT NOT NULL,
            today_relation TEXT
        );
        INSERT INTO ${tableNames.anchor} (row_id, cur_time) VALUES (1, '2024-03-15 12:00');
        INSERT INTO ${tableNames.chronicle} (row_id, time_span, today_relation) VALUES
            (1, '2024-03-15 08:00 ~ 2024-03-15 09:00', ''),
            (2, '2024-03-12 08:00 ~ 2024-03-12 09:00', ''),
            (3, '2024-03-17 08:00 ~ 2024-03-17 09:00', '旧值'),
            (4, '2024-03-14 23:45 ~ 2024-03-15 00:05', '今天');
    `);
}

function seedCalendar(db, tableName) {
    db.exec(`
        CREATE TABLE ${tableName} (
            row_id INTEGER PRIMARY KEY,
            date_text TEXT NOT NULL,
            weekday_text TEXT,
            month_days INTEGER
        );
        INSERT INTO ${tableName} (row_id, date_text, weekday_text, month_days) VALUES
            (1, '2024-02-29', '', 0),
            (2, '2024-03-01', '旧值', 0);
    `);
}

async function main() {
    const sqlite = loadSqlite();
    if (!sqlite) {
        console.log('[跳过] 当前 Node 未提供 node:sqlite；SQL 字符串合同仍由其他检查覆盖');
        return;
    }

    const chronicle = await import(pathToFileURL(CHRONICLE_SQL_PATH).href);
    const calendar = await import(pathToFileURL(CALENDAR_SQL_PATH).href);

    const oldDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(oldDb, { anchor: 'global_state', chronicle: 'chronicle' });
    seedCalendar(oldDb, 'small_calendar_days');
    oldDb.exec(chronicle.buildChronicleTodayRelationUpdateSql());
    oldDb.exec(calendar.buildSmallCalendarDerivedFieldsUpdateSql());
    assert.deepStrictEqual(readRows(oldDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'), [
        { row_id: 1, today_relation: '今天' },
        { row_id: 2, today_relation: '3天前' },
        { row_id: 3, today_relation: '后天' },
        { row_id: 4, today_relation: '昨天 ~ 今天' },
    ], '作者 DDL 表名环境必须按 row_id 写回对应纪要行');
    assert.deepStrictEqual(readRows(oldDb, 'SELECT row_id, weekday_text, month_days FROM small_calendar_days ORDER BY row_id'), [
        { row_id: 1, weekday_text: '星期四', month_days: 29 },
        { row_id: 2, weekday_text: '星期五', month_days: 31 },
    ], '作者 DDL 表名环境必须按 row_id 写回对应小日历行');
    oldDb.close();

    const reboundDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(reboundDb, { anchor: 'quanjushujubiao', chronicle: 'jiyaobiao' });
    seedCalendar(reboundDb, 'xiaorilibiao');
    const reboundChronicleSql = rebindDeclaredTables(chronicle.buildChronicleTodayRelationUpdateSql(), [
        ['global_state', 'quanjushujubiao'],
        ['chronicle', 'jiyaobiao'],
    ]);
    const reboundCalendarSql = rebindDeclaredTables(calendar.buildSmallCalendarDerivedFieldsUpdateSql(), [
        ['small_calendar_days', 'xiaorilibiao'],
    ]);
    assert.ok(!reboundChronicleSql.includes('chronicle.row_id'), '重绑定后的纪要 SQL 不得残留逻辑表名前缀');
    assert.ok(!reboundCalendarSql.includes('small_calendar_days.row_id'), '重绑定后的小日历 SQL 不得残留逻辑表名前缀');
    reboundDb.exec(reboundChronicleSql);
    reboundDb.exec(reboundCalendarSql);
    assert.deepStrictEqual(readRows(reboundDb, 'SELECT row_id, today_relation FROM jiyaobiao ORDER BY row_id'), [
        { row_id: 1, today_relation: '今天' },
        { row_id: 2, today_relation: '3天前' },
        { row_id: 3, today_relation: '后天' },
        { row_id: 4, today_relation: '昨天 ~ 今天' },
    ], '拼音物理表环境必须按 row_id 写回对应纪要行');
    assert.deepStrictEqual(readRows(reboundDb, 'SELECT row_id, weekday_text, month_days FROM xiaorilibiao ORDER BY row_id'), [
        { row_id: 1, weekday_text: '星期四', month_days: 29 },
        { row_id: 2, weekday_text: '星期五', month_days: 31 },
    ], '拼音物理表环境必须按 row_id 写回对应小日历行');
    reboundDb.close();

    const sheetDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(sheetDb, { anchor: 'sheet_quan_ju_shu_ju_biao', chronicle: 'sheet_ji_yao_biao' });
    seedCalendar(sheetDb, 'sheet_xiao_ri_li_biao');
    const sheetChronicleSignatureSql = chronicle.buildChronicleTodayRelationSignatureSql('sheet_quan_ju_shu_ju_biao', 'sheet_ji_yao_biao');
    const sheetCalendarSignatureSql = calendar.buildSmallCalendarDerivedFieldsSignatureSql('sheet_xiao_ri_li_biao');
    assert.strictEqual(readRows(sheetDb, sheetChronicleSignatureSql)[0].pending_update_count, 4, 'sheet 标识纪要表必须识别全部待派生行，包括旧的单端关系');
    assert.strictEqual(readRows(sheetDb, sheetCalendarSignatureSql)[0].pending_update_count, 2, 'sheet 标识小日历表必须识别全部待派生行');
    sheetDb.exec(chronicle.buildChronicleTodayRelationUpdateSql('sheet_quan_ju_shu_ju_biao', 'sheet_ji_yao_biao'));
    sheetDb.exec(calendar.buildSmallCalendarDerivedFieldsUpdateSql('sheet_xiao_ri_li_biao'));
    assert.deepStrictEqual(readRows(sheetDb, 'SELECT row_id, today_relation FROM sheet_ji_yao_biao ORDER BY row_id'), [
        { row_id: 1, today_relation: '今天' },
        { row_id: 2, today_relation: '3天前' },
        { row_id: 3, today_relation: '后天' },
        { row_id: 4, today_relation: '昨天 ~ 今天' },
    ], 'sheet 标识环境必须按 row_id 写回对应纪要行');
    assert.deepStrictEqual(readRows(sheetDb, 'SELECT row_id, weekday_text, month_days FROM sheet_xiao_ri_li_biao ORDER BY row_id'), [
        { row_id: 1, weekday_text: '星期四', month_days: 29 },
        { row_id: 2, weekday_text: '星期五', month_days: 31 },
    ], 'sheet 标识环境必须按 row_id 写回对应小日历行');
    assert.strictEqual(readRows(sheetDb, sheetChronicleSignatureSql)[0].pending_update_count, 0, 'sheet 标识纪要派生完成后不得重复写入');
    assert.strictEqual(readRows(sheetDb, sheetCalendarSignatureSql)[0].pending_update_count, 0, 'sheet 标识小日历派生完成后不得重复写入');
    sheetDb.close();

    const rangeDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(rangeDb, { anchor: 'global_state', chronicle: 'chronicle' });
    rangeDb.exec("UPDATE global_state SET cur_time = '2026-10-17 00:05'; DELETE FROM chronicle;");
    const rangeCases = [
        ['2026-10-16 23:45 ~ 2026-10-17 00:05', '昨天 ~ 今天', '今天'],
        ['2026-10-17 00:01 ~ 2026-10-17 00:05', '今天', '今天'],
        ['2026-10-16 08:00 ~ 2026-10-16 09:00', '昨天'],
        ['2026-10-15 23:45 ~ 2026-10-16 00:05', '前天 ~ 昨天'],
        ['2026-10-16 23:45 ~ 2026-10-18 00:05', '昨天 ~ 明天'],
        ['2026-10-17 23:45 ~ 2026-10-18 00:05', '今天 ~ 明天'],
        ['无法解析 ~ 2026-10-17 00:05', '今天'],
        ['2026-10-16 23:45 ~ 无法解析', '昨天'],
        ['无法解析 ~ 仍无法解析', '保留原值', '保留原值'],
        ['2026-10-17 00:05', '今天'],
        ['', '保留空跨度', '保留空跨度'],
        [' 2026-10-16 23:45   ~   2026-10-17 00:05 ', '昨天 ~ 今天'],
        ['2026-09-01 08:00 ~ 2026-09-02 09:00', '一个半月前'],
        ['2025-10-22 08:00 ~ 2025-10-23 09:00', '一年前 ~ 半年前'],
        ['2026-11-01 08:00 ~ 2026-11-02 09:00', '半个月后 ~ 16天后'],
    ];
    const insertRange = rangeDb.prepare('INSERT INTO chronicle (row_id, time_span, today_relation) VALUES (?, ?, ?)');
    rangeCases.forEach(([timeSpan, , initial = '旧值'], index) => insertRange.run(index + 1, timeSpan, initial));
    const rangeSignatureSql = chronicle.buildChronicleTodayRelationSignatureSql();
    const rangeUpdateSql = chronicle.buildChronicleTodayRelationUpdateSql();
    const beforeRange = readRows(rangeDb, rangeSignatureSql)[0];
    assert.strictEqual(beforeRange.pending_update_count, rangeCases.filter(([, expected, initial = '旧值']) => initial !== expected).length, '签名必须按两端关系识别待更新行，同日已有正确值不需更新');
    assert.strictEqual(beforeRange.invalid_count, 1, '只有两端都无法解析的非空跨度才算无效输入');
    assert.strictEqual(beforeRange.invalid_row_ids, '9', '无效跨度行身份必须保持稳定');
    assert.deepStrictEqual(readRows(rangeDb, chronicle.buildChronicleInvalidTimeSpanDebugSql()), [
        { row_id: 9, time_span: '无法解析 ~ 仍无法解析' },
    ], '调试 SQL 必须保持单端可用回退与空跨度静默跳过');
    rangeDb.exec(rangeUpdateSql);
    assert.deepStrictEqual(readRows(rangeDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'),
        rangeCases.map(([, today_relation], index) => ({ row_id: index + 1, today_relation })),
        '纪要关系必须合并两端文案、折叠相同关系，并保留单端回退和无效原值');
    const afterRange = readRows(rangeDb, rangeSignatureSql)[0];
    assert.strictEqual(afterRange.pending_update_count, 0, '签名查询与写入必须使用一致的两端关系规则，写后立即 clean');
    assert.strictEqual(afterRange.source_signature, beforeRange.source_signature, '派生写入不得改变业务源签名');
    assert.notStrictEqual(afterRange.input_signature, beforeRange.input_signature, '派生写入必须反映在完整输入签名中');
    rangeDb.exec(rangeUpdateSql);
    assert.strictEqual(readRows(rangeDb, 'SELECT changes() AS count')[0].count, 0, '重复执行不得重新写入已完成的两端关系');
    rangeDb.exec("UPDATE chronicle SET today_relation = '今天' WHERE row_id = 1;");
    assert.strictEqual(readRows(rangeDb, rangeSignatureSql)[0].pending_update_count, 1, '回退为旧单端关系时必须能再次识别派生漂移');
    rangeDb.exec(rangeUpdateSql);
    assert.strictEqual(readRows(rangeDb, rangeSignatureSql)[0].pending_update_count, 0, '修复旧单端关系后必须再次 clean');
    const stableRangeRows = readRows(rangeDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id');
    rangeDb.exec("UPDATE global_state SET cur_time = '无法解析';");
    rangeDb.exec(rangeUpdateSql);
    assert.strictEqual(readRows(rangeDb, rangeSignatureSql)[0].pending_update_count, 0, '故事日期无法解析时不得用现实日期派生');
    assert.deepStrictEqual(readRows(rangeDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'), stableRangeRows, '故事日期无法解析时必须保留全部原值');
    rangeDb.exec('DELETE FROM global_state;');
    rangeDb.exec(rangeUpdateSql);
    assert.deepStrictEqual(readRows(rangeDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'), stableRangeRows, '故事日期锚点空表时必须保留全部原值');
    [
        ['2026-11-01 00:05', '2026-10-31 23:45 ~ 2026-11-01 00:05'],
        ['2027-01-01 00:05', '2026-12-31 23:45 ~ 2027-01-01 00:05'],
        ['2024-03-01 00:05', '2024-02-29 23:45 ~ 2024-03-01 00:05'],
    ].forEach(([anchor, timeSpan]) => {
        rangeDb.exec('DELETE FROM chronicle;');
        rangeDb.prepare('INSERT OR REPLACE INTO global_state (row_id, cur_time) VALUES (1, ?)').run(anchor);
        insertRange.run(1, timeSpan, '今天');
        rangeDb.exec(rangeUpdateSql);
        assert.strictEqual(readRows(rangeDb, 'SELECT today_relation FROM chronicle')[0].today_relation, '昨天 ~ 今天', `${timeSpan} 跨月、跨年、闰日必须继续沿用真实日期差`);
        assert.strictEqual(readRows(rangeDb, rangeSignatureSql)[0].pending_update_count, 0, '历法边界写后也必须 clean');
    });
    rangeDb.close();

    const signedDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(signedDb, { anchor: 'global_state', chronicle: 'chronicle' });
    signedDb.exec(`
        UPDATE global_state SET cur_time = '2012-02-11 12:00';
        DELETE FROM chronicle;
        INSERT INTO chronicle (row_id, time_span, today_relation) VALUES
            (1, '2012-02-11 08:00 ~ -2012-02-11 09:00', ''),
            (2, '-2012-02-11 08:00 ~ -2012-02-11 09:00', ''),
            (3, '-2012-02-11 08:00 ~ 2012-02-11 09:00', '');
    `);
    const signatureSql = chronicle.buildChronicleTodayRelationSignatureSql();
    const updateSql = chronicle.buildChronicleTodayRelationUpdateSql();
    assert.deepStrictEqual(
        readRows(signedDb, signatureSql).map(({ invalid_count, pending_update_count }) => ({ invalid_count, pending_update_count })),
        [{ invalid_count: 0, pending_update_count: 3 }],
        '纪要右侧负年份必须被识别为有效待计算日期',
    );
    signedDb.exec(updateSql);
    assert.deepStrictEqual(readRows(signedDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'), [
        { row_id: 1, today_relation: '今天 ~ 4082年半前' },
        { row_id: 2, today_relation: '4082年半前' },
        { row_id: 3, today_relation: '4082年半前 ~ 今天' },
    ], '正年份当前时间必须分别计算正负年份两端，并保持原文跨度顺序');
    assert.strictEqual(readRows(signedDb, signatureSql)[0].pending_update_count, 0, '正负年份跨度写后必须 clean');

    signedDb.exec("UPDATE global_state SET cur_time = '-2012-02-11 12:00'");
    signedDb.exec(updateSql);
    assert.deepStrictEqual(readRows(signedDb, 'SELECT row_id, today_relation FROM chronicle ORDER BY row_id'), [
        { row_id: 1, today_relation: '4082年半后 ~ 今天' },
        { row_id: 2, today_relation: '今天' },
        { row_id: 3, today_relation: '今天 ~ 4082年半后' },
    ], '负年份当前时间也必须保留两端关系与现有年数文案');
    assert.strictEqual(readRows(signedDb, signatureSql)[0].pending_update_count, 0, '负年份故事日期写后必须 clean');
    signedDb.close();

    const formatDb = new sqlite.DatabaseSync(':memory:');
    seedChronicle(formatDb, { anchor: 'global_state', chronicle: 'chronicle' });
    const formats = [
        (day) => `2026-5-${day}`,
        (day) => `2026-05-0${day}`,
        (day) => `2026/5/${day}`,
        (day) => `2026.5.${day}`,
        (day) => `2026年5月${day}日`,
        (day) => `2026-05-${day}`,
    ];
    const separators = ['~', '～', '〜', '至', '到', '—', '–', ' - '];
    const formatInsert = formatDb.prepare('INSERT INTO chronicle VALUES (?, ?, ?)');
    const formatSignature = formatDb.prepare(signatureSql);
    const formatRows = formatDb.prepare('SELECT row_id, time_span, today_relation FROM chronicle ORDER BY row_id');
    formats.forEach((anchorFormat) => {
        formatDb.exec('DELETE FROM chronicle');
        formatDb.prepare('UPDATE global_state SET cur_time = ?').run(`　${anchorFormat(6)} 12:00　`);
        const cases = formats.flatMap((format) => separators.map((separator) => `${format(5)} 23:00${separator}${format(6)}T1:00:00`));
        cases.forEach((span, index) => formatInsert.run(index + 1, span, '旧值'));
        assert.strictEqual(formatSignature.get().invalid_count, 0, '日期写法和区间分隔符组合必须全部可解析');
        assert.strictEqual(formatSignature.get().pending_update_count, cases.length, '兼容格式必须参与待更新检查');
        formatDb.exec(updateSql);
        assert.deepStrictEqual(formatRows.all().map((row) => ({ ...row })), cases.map((time_span, index) => ({
            row_id: index + 1, time_span, today_relation: '昨天 ~ 今天',
        })), '兼容输入必须按真实日期差写回，原始时间文本不得被改写');
        assert.strictEqual(formatSignature.get().pending_update_count, 0, '兼容格式写入后签名必须收敛');
        formatDb.exec(updateSql);
        assert.strictEqual(readRows(formatDb, 'SELECT changes() AS count')[0].count, 0, '兼容格式不得重复写入');
    });

    const edgeCases = [
        ['2026/11/1', '2026/10/31 23:45～2026/11/1 00:05', '昨天 ~ 今天'],
        ['2027年1月1日', '2026年12月31日 至 2027年1月1日', '昨天 ~ 今天'],
        ['2024-3-1', '2024-2-29—2024-3-1', '昨天 ~ 今天'],
        ['2026-5-6', '2026-2-30 ~ 2026-5-6', '今天'],
        ['2026-5-6', '2026-5-5 ~ 2026-13-1', '昨天'],
        ['2026-5-6', '2026-5-6 1:2:3', '今天'],
        ['2026-5-6', '2026-5-6', '今天'],
        ...['1', '01', '001', '0001'].flatMap((year) => [
            ['0001-5-6', `${year}-5-5 至 ${year}-5-6`, '昨天 ~ 今天'],
            [`${year}-5-6`, '0001-5-6', '今天'],
            [`-${year}-5-6`, '-0001-5-5 ～ -0001-5-6', '昨天 ~ 今天'],
        ]),
        ['26-5-6', '0026-5-6', '今天'],
        ['0-5-6', '0000-5-6', '今天'],
    ];
    edgeCases.forEach(([anchor, span, expected]) => {
        formatDb.exec('DELETE FROM chronicle');
        formatDb.prepare('UPDATE global_state SET cur_time = ?').run(anchor);
        formatInsert.run(1, span, '旧值');
        formatDb.exec(updateSql);
        assert.strictEqual(formatRows.get().today_relation, expected, `${anchor} / ${span} 必须保留年份含义、历法边界和单端回退`);
        assert.strictEqual(formatSignature.get().pending_update_count, 0, '历法及年份兼容写入后必须收敛');
    });

    formatDb.exec('DELETE FROM chronicle');
    formatDb.prepare('UPDATE global_state SET cur_time = ?').run('2026-5-6');
    const invalidDates = ['2026-2-30', '2025-2-29', '2026-0-1', '2026-13-1', '2026-5-0', '2026-5-32',
        '2026-005-6', '2026-5-006', '10000-5-6', '--1-5-6', '二〇二六年五月六日', '明天', '5/6/2026'];
    invalidDates.forEach((span, index) => formatInsert.run(index + 1, span, '旧值'));
    assert.strictEqual(formatSignature.get().invalid_count, invalidDates.length, '不存在的日期和含糊日期不得猜测或溢出到下个月');
    assert.deepStrictEqual(readRows(formatDb, chronicle.buildChronicleInvalidTimeSpanDebugSql()),
        invalidDates.map((time_span, index) => ({ row_id: index + 1, time_span })), '诊断查询必须与实际计算使用相同解析规则');
    formatDb.exec(updateSql);
    assert.ok(formatRows.all().every((row) => row.today_relation === '旧值'), '无效日期必须保留原值');
    formatDb.exec('DELETE FROM chronicle');
    formatInsert.run(1, '2026-5-6', '旧值');
    invalidDates.forEach((anchor) => {
        formatDb.prepare('UPDATE global_state SET cur_time = ?').run(anchor);
        formatDb.exec(updateSql);
        assert.strictEqual(formatRows.get().today_relation, '旧值', `无效剧情日期 ${anchor} 不得生成关系`);
    });
    formatDb.close();

    console.log('[通过] 派生字段 SQL：表名重绑定、两端关系、签名收敛、288 组日期格式、年份补零、历法校验与无效输入回退');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
