const assert = require('assert/strict');
const { pathToFileURL } = require('url');

const EXPECTED_BUILTIN_SHEET_KEYS = Object.freeze([
    'sheet_square_posts',
    'sheet_forum_threads',
    'sheet_livestream_rooms',
    'sheet_small_calendar',
    'sheet_npc_diary_entries',
    'sheet_system_shop',
    'sheet_summary',
]);
const LEGACY_MESSAGE_RECORD_SHEET_KEY = 'sheet_IVu96w0X';

async function importSourceModel() {
    const moduleUrl = pathToFileURL('modules/phone-fusion/source-model.js');
    return import(`${moduleUrl.href}?freshness=${Date.now()}`);
}

function createValidTemplate(overrides = {}) {
    return {
        mate: { type: 'chatSheets', version: 1 },
        sheet_valid: {
            name: '有效表',
            orderNo: 1,
            sourceData: { role: 'valid' },
            content: [['id', 'text'], ['1', 'hello']],
        },
        ...overrides,
    };
}

function getSheet(model, key) {
    return model.sheets.find((sheet) => sheet.key === key);
}

(async () => {
    const sourceModel = await importSourceModel();
    const {
        FUSION_SOURCE_TYPES,
        normalizeFusionSource,
        createLocalJsonSourceModel,
        createBuiltinTheaterSourceModel,
        createDatabaseCurrentSourceModel,
        validateFusionTemplate,
    } = sourceModel;

    assert.deepEqual(FUSION_SOURCE_TYPES, Object.freeze({
        LOCAL: 'local',
        BUILTIN_THEATER: 'builtin-theater',
        DATABASE_CURRENT: 'database-current',
    }));
    assert.equal(typeof normalizeFusionSource, 'function');
    assert.equal(typeof createLocalJsonSourceModel, 'function');
    assert.equal(typeof createBuiltinTheaterSourceModel, 'function');
    assert.equal(typeof createDatabaseCurrentSourceModel, 'function');
    assert.equal(typeof validateFusionTemplate, 'function');

    const builtin = createBuiltinTheaterSourceModel();
    assert.equal(builtin.type, FUSION_SOURCE_TYPES.BUILTIN_THEATER);
    assert.equal(builtin.valid, true);
    assert.equal(builtin.invalidReason, '');
    assert.equal(builtin.name, '内置小剧场+纪要表');
    assert.equal(builtin.meta.sourcePath, 'tables/generated/小剧场2.1.json + tables/generated/纪要.json');
    assert.equal(typeof builtin.meta.sha256, 'string');
    const builtinSheetKeys = builtin.sheets.map((sheet) => sheet.key);
    assert.deepEqual(builtinSheetKeys, EXPECTED_BUILTIN_SHEET_KEYS);
    assert.equal(builtin.sheetCount, EXPECTED_BUILTIN_SHEET_KEYS.length);
    assert.ok(!builtinSheetKeys.includes(LEGACY_MESSAGE_RECORD_SHEET_KEY));
    assert.equal(builtin.invalidSheetCount, 0);
    assert.ok(getSheet(builtin, 'sheet_summary'), 'builtin source model 必须包含 sheet_summary');
    assert.equal(getSheet(builtin, 'sheet_summary').name, '纪要表');

    for (const badInput of [null, 'text', []]) {
        const invalid = validateFusionTemplate(badInput);
        assert.equal(invalid.valid, false);
        assert.equal(invalid.invalidReason, 'source_not_object');
        assert.deepEqual(invalid.sheets, []);
    }


    const missingMateType = validateFusionTemplate(createValidTemplate({ mate: { version: 1 } }));
    assert.equal(missingMateType.valid, false);
    assert.equal(missingMateType.sourceUsable, false);
    assert.equal(missingMateType.invalidReason, 'source_not_chat_sheets');
    assert.equal(missingMateType.sheetCount, 1);
    assert.equal(getSheet(missingMateType, 'sheet_valid').valid, true);

    const wrongMate = validateFusionTemplate(createValidTemplate({ mate: { type: 'wrong' } }));
    assert.equal(wrongMate.valid, false);
    assert.equal(wrongMate.sourceUsable, false);
    assert.equal(wrongMate.invalidReason, 'source_not_chat_sheets');
    assert.equal(wrongMate.sheetCount, 1);
    assert.equal(getSheet(wrongMate, 'sheet_valid').valid, true);

    const noSheets = validateFusionTemplate({ mate: { type: 'chatSheets' } });
    assert.equal(noSheets.valid, false);
    assert.equal(noSheets.invalidReason, 'source_no_sheets');
    assert.deepEqual(noSheets.sheets, []);

    const mixed = validateFusionTemplate(createValidTemplate({
        sheet_no_source: {
            name: '缺 sourceData',
            content: [['id'], ['1']],
        },
        sheet_missing_content: {
            name: '缺 content',
            sourceData: { role: 'missing-content' },
        },
        sheet_bad_content: {
            name: '坏内容',
            sourceData: { role: 'bad-content' },
            content: ['not-2d'],
        },
        sheet_not_object: 'not-object',
        sheet_missing_name: {
            sourceData: { role: 'missing-name' },
            content: [['id'], ['1']],
        },
        sheet_no_header: {
            name: '空表头',
            sourceData: { role: 'no-header' },
            content: [],
        },
    }));
    assert.equal(mixed.valid, true);
    assert.equal(mixed.sourceUsable, true);
    assert.equal(mixed.hasValidSheets, true);
    assert.equal(mixed.hasInvalidSheets, true);
    assert.equal(mixed.allSheetsValid, false);
    assert.equal(mixed.templateImportable, false);
    assert.equal(mixed.sheetCount, 7);
    assert.equal(getSheet(mixed, 'sheet_valid').valid, true);
    assert.equal(getSheet(mixed, 'sheet_no_source').valid, false);
    assert.equal(getSheet(mixed, 'sheet_no_source').invalidReason, 'sheet_missing_source_data');
    assert.equal(getSheet(mixed, 'sheet_missing_content').valid, false);
    assert.equal(getSheet(mixed, 'sheet_missing_content').invalidReason, 'sheet_content_not_array');
    assert.equal(getSheet(mixed, 'sheet_bad_content').valid, false);
    assert.equal(getSheet(mixed, 'sheet_bad_content').invalidReason, 'sheet_content_not_2d_array');
    assert.equal(getSheet(mixed, 'sheet_not_object').valid, false);
    assert.equal(getSheet(mixed, 'sheet_not_object').invalidReason, 'sheet_not_object');
    assert.equal(getSheet(mixed, 'sheet_missing_name').valid, false);
    assert.equal(getSheet(mixed, 'sheet_missing_name').invalidReason, 'sheet_missing_name');
    assert.equal(getSheet(mixed, 'sheet_no_header').valid, false);
    assert.equal(getSheet(mixed, 'sheet_no_header').invalidReason, 'sheet_missing_header');

    const allInvalid = validateFusionTemplate({
        mate: { type: 'chatSheets', version: 1 },
        sheet_invalid: {
            name: '缺 sourceData',
            content: [['id'], ['1']],
        },
    });
    assert.equal(allInvalid.valid, false);
    assert.equal(allInvalid.invalidReason, 'source_no_valid_sheets');
    assert.equal(allInvalid.hasValidSheets, false);
    assert.equal(allInvalid.hasInvalidSheets, true);
    assert.equal(allInvalid.allSheetsValid, false);
    assert.equal(allInvalid.templateImportable, false);

    const databaseCurrent = createDatabaseCurrentSourceModel(createValidTemplate({
        sheet_no_source: {
            name: '数据库缺来源',
            content: [['id'], ['1']],
        },
    }));
    assert.equal(databaseCurrent.type, FUSION_SOURCE_TYPES.DATABASE_CURRENT);
    assert.equal(databaseCurrent.valid, true);
    assert.equal(getSheet(databaseCurrent, 'sheet_valid').valid, true);
    assert.equal(getSheet(databaseCurrent, 'sheet_no_source').valid, false);
    assert.equal(getSheet(databaseCurrent, 'sheet_no_source').invalidReason, 'sheet_missing_source_data');

    const normalizedBuiltin = normalizeFusionSource(null, { type: FUSION_SOURCE_TYPES.BUILTIN_THEATER });
    assert.equal(normalizedBuiltin.type, FUSION_SOURCE_TYPES.BUILTIN_THEATER);
    assert.equal(normalizedBuiltin.valid, true);

    const unknownType = normalizeFusionSource(createValidTemplate(), { type: 'unknown-source' });
    assert.equal(unknownType.type, 'unknown-source');
    assert.equal(unknownType.valid, false);
    assert.equal(unknownType.invalidReason, 'source_unknown_type');

    const cyclic = { mate: { type: 'chatSheets' } };
    cyclic.sheet_cycle = {
        name: '循环引用',
        sourceData: { role: 'cycle' },
        content: [['id'], ['1']],
    };
    cyclic.self = cyclic;
    const notSerializable = validateFusionTemplate(cyclic);
    assert.equal(notSerializable.valid, false);
    assert.equal(notSerializable.invalidReason, 'source_not_json_serializable');

    const local = createLocalJsonSourceModel(createValidTemplate(), 'local.json');
    assert.equal(local.type, FUSION_SOURCE_TYPES.LOCAL);
    assert.equal(local.meta.fileName, 'local.json');
    assert.equal(local.valid, true);

    console.log('[fusion-source-validation] OK');
})().catch((error) => {
    console.error('[fusion-source-validation] FAILED');
    console.error(error);
    process.exitCode = 1;
});
