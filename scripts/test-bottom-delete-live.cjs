// Destructive test setup is limited to a newly created character in an isolated host.
// Requires installed phone + shujuku builds, Playwright, and YUZI_TEST_ALLOW_WRITES=1.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.YUZI_TEST_PLAYWRIGHT || 'playwright');
const base = process.env.YUZI_TEST_BASE_URL;
if (!base || process.env.YUZI_TEST_ALLOW_WRITES !== '1') throw new Error('Use an isolated host with YUZI_TEST_BASE_URL and YUZI_TEST_ALLOW_WRITES=1.');

async function main() {
    const browser = await chromium.launch({ executablePath: process.env.YUZI_TEST_BROWSER || undefined, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
    const characterName = `Yuzi Delete Verification ${Date.now()}`;
    const tableName = 'yuzideletetest';
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'yuzi-bottom-delete-live-'));
    const report = { characterName, tableName, results: [] };
    const pluginErrors = [];
    page.on('pageerror', error => { if (String(error.stack).includes('st-yuzi-phone')) pluginErrors.push(error.message); });
    async function ready() {
        // SQL read methods are intentionally hidden until an active chat's runtime is ready.
        await page.waitForFunction(() => !!window.AutoCardUpdaterAPI?.executeSqlMutation, undefined, { timeout: 90000 });
        await page.locator('#preloader').waitFor({ state: 'hidden', timeout: 90000 });
        if (await page.locator('.onboarding:visible').count()) {
            await page.locator('.popup-input:visible').fill('Yuzi verification');
            await page.locator('.popup-button-ok:visible').click();
        }
        await page.waitForFunction(() => window.SillyTavern.getContext().characters.length > 0);
    }
    async function selectCharacter() {
        await page.evaluate(async name => {
            const context = SillyTavern.getContext();
            const index = context.characters.findIndex(character => character.name === name);
            if (index < 0) throw new Error('Test character not found');
            await context.selectCharacterById(index, { switchMenu: false });
        }, characterName);
        await page.waitForFunction(name => SillyTavern.getContext().chat.some(message => message.name === name), characterName);
    }
    async function readRows(allowEmptyDatabase = false) {
        await page.waitForFunction(() => typeof window.AutoCardUpdaterAPI?.querySql === 'function'
            || typeof window.AutoCardUpdaterAPI?.executeSqlQuery === 'function');
        const observation = await page.evaluate(async ({ table, allowEmptyDatabase }) => {
            const query = AutoCardUpdaterAPI.querySql || AutoCardUpdaterAPI.executeSqlQuery;
            if (typeof query !== 'function') throw new Error(`SQL query API missing: ${Object.keys(AutoCardUpdaterAPI).join(', ')}`);
            const result = await query(`SELECT row_id, label, notes FROM ${table} ORDER BY row_id`);
            if (result?.rows) return { rows: result.rows, tablePresent: true };
            const error = AutoCardUpdaterAPI.getLastSqlApiError?.();
            if (allowEmptyDatabase && error?.code === 'table_not_found') {
                // Some database builds do not recreate physical tables for an empty snapshot.
                // Prove that the whole dedicated runtime has no user tables, rather than
                // treating an arbitrary SQL failure as a successful empty read.
                const catalog = await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_acu_%'");
                if (catalog?.rows?.length === 0) return { rows: [], tablePresent: false };
            }
            throw new Error(`SQL read failed: ${error?.code || 'unknown'}`);
        }, { table: tableName, allowEmptyDatabase });
        if (!observation.tablePresent) report.emptyDatabaseAfterReopen = { userTables: 0, templateRows: 0 };
        return observation.rows;
    }
    async function sheet() {
        return page.evaluate(table => {
            const found = Object.entries(AutoCardUpdaterAPI.exportTableAsJson()).find(([, value]) => value?.name === table);
            return found ? { key: found[0], content: found[1].content } : null;
        }, tableName);
    }
    async function reopen(expectedCount) {
        await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await selectCharacter();
        await page.waitForFunction(({ table, count }) => Object.values(AutoCardUpdaterAPI.exportTableAsJson()).some(value => value?.name === table && value.content?.length === count + 1), { table: tableName, count: expectedCount });
        assert.equal((await readRows(expectedCount === 0)).length, expectedCount, '重开后 SQL 行数或空数据库');
        const current = await sheet();
        await page.locator(`.yuzi-bottom-tab[data-sheet="${current.key}"]`).click();
        return current.key;
    }
    const panel = page.locator('.yuzi-bottom-panel');
    const action = name => panel.locator(`[data-action="${name}"]`);
    async function confirm() {
        await action('delete-selected').click(); await panel.locator('.phone-confirm-dialog-confirm').click();
        await action('delete').waitFor();
    }
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded' }); await ready();
        const avatar = await page.evaluate(async name => {
            const data = new FormData(); data.set('ch_name', name); data.set('first_mes', 'Local database deletion verification.');
            const headers = { ...SillyTavern.getContext().getRequestHeaders() }; delete headers['Content-Type']; delete headers['content-type'];
            const response = await fetch('/api/characters/create', { method: 'POST', headers, body: data });
            if (!response.ok) throw new Error(`Create test character: ${response.status}`);
            const avatar = await response.text(); await (await import('/script.js')).getCharacters(); return avatar;
        }, characterName);
        report.avatar = avatar;
        await selectCharacter();
        await page.evaluate(() => AutoCardUpdaterAPI.openSettings());
        await page.evaluate(() => { const button = document.querySelector('.acu-v2-sidebar__brand-title'); for (let i = 0; i < 5; i++) button.click(); });
        await page.getByRole('button', { name: '进阶模式', exact: true }).click();
        await page.locator('[data-page-id="dashboard"]').click();
        await page.getByRole('radiogroup', { name: '开关分组切换', exact: true }).getByRole('radio', { name: '高级设置', exact: true }).click();
        const sql = page.getByRole('radiogroup', { name: '存储模式', exact: true }).getByRole('radio', { name: 'SQL', exact: true });
        if (await sql.getAttribute('aria-checked') !== 'true') {
            await sql.click(); await page.getByText('已切换到 SQLite 模式。', { exact: true }).waitFor();
        }
        const initialized = await page.evaluate(async table => AutoCardUpdaterAPI.initGameSession({}, {
            loadPreset: false, resetExistingTableData: true,
            templateData: { mate: { type: 'chatSheets', version: 1 }, sheet_yuzideletetest: {
                uid: 'sheet_yuzideletetest', name: table, orderNo: 0,
                sourceData: { ddl: `CREATE TABLE ${table} (row_id INTEGER PRIMARY KEY, label TEXT, notes TEXT);`, note: 'Local deletion verification only' },
                content: [['row_id', 'label', 'notes']], exportConfig: { enabled: false }, updateConfig: {},
            } },
        }), tableName);
        assert.equal(initialized.success, true, initialized.message);
        assert.notEqual(initialized.runtimeReady, false);
        const inserted = await page.evaluate(async table => AutoCardUpdaterAPI.executeSqlMutation(
            `INSERT INTO ${table} (row_id, label, notes) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
            [1, 'delete A', 'real saved data', 5, 'keep locked', 'must remain', 9, 'delete C', 'real saved data'],
        ), tableName);
        assert.equal(inserted.saved, true); assert.equal(inserted.changes, 3); assert.deepEqual(inserted.errors, []);
        assert.equal((await readRows()).length, 3);
        assert.equal((await sheet()).content.length, 4, '真实导出视图包含三条写入记录');
        report.results.push({ step: 'insert', result: inserted, rows: await readRows() });
        console.log('Live check: three records saved and verified through SQL and exported table data.');
        await page.evaluate(async () => {
            const context = SillyTavern.getContext();
            context.extensionSettings.YuziPhone = { ...context.extensionSettings.YuziPhone, enabled: true,
                bottomVisualization: { ...context.extensionSettings.YuziPhone?.bottomVisualization, enabled: true, position: 'fixed' } };
            await (await import('/script.js')).saveSettings();
        });

        let key = await reopen(3);
        assert.equal(await page.evaluate(key => AutoCardUpdaterAPI.setTableLockState(key, { rows: [1], cols: [], cells: [] }, { merge: false }), key), true);
        await action('delete').click();
        assert.equal(await panel.locator('[data-row-index="1"][data-action="toggle-delete-row"]').isDisabled(), true);
        await action('select-all-delete').click(); assert.match(await action('delete-selected').textContent(), /2/);
        await action('delete-selected').click(); await panel.locator('.phone-confirm-dialog-cancel').click();
        assert.equal((await readRows()).length, 3, '取消不写数据库');
        await confirm();
        assert.deepEqual((await readRows()).map(row => Number(row.row_id)), [5], '实际 SQL 只删除选中的稀疏 row_id');
        assert.equal((await sheet()).content.length, 2);
        assert.deepEqual(await page.evaluate(key => AutoCardUpdaterAPI.getTableLockState(key).rows, key), [0], '真实锁定位置重排');
        assert.equal(await panel.locator('.yuzi-bottom-card').count(), 1);
        report.results.push({ step: 'delete', rows: await readRows() });
        console.log('Live check: two selected records deleted; locked row and remapped lock verified.');
        await page.screenshot({ path: path.join(output, 'after-delete.png') });

        key = await reopen(1);
        assert.deepEqual((await readRows()).map(row => Number(row.row_id)), [5], '刷新与重开后不复活已删行');
        report.results.push({ step: 'reopen', rows: await readRows() });
        console.log('Live check: deleted records remain absent after refresh and reopening the chat.');
        await page.evaluate(key => AutoCardUpdaterAPI.setTableLockState(key, { rows: [], cols: [], cells: [] }, { merge: false }), key);
        await action('delete').click(); await action('select-all-delete').click(); await action('delete-selected').click();
        const updated = await page.evaluate(table => AutoCardUpdaterAPI.executeSqlMutation(`UPDATE ${table} SET notes = ? WHERE row_id = ?`, ['external saved update', 5]), tableName);
        assert.equal(updated.saved, true);
        await panel.locator('.phone-confirm-dialog-overlay').waitFor({ state: 'detached' });
        assert.equal((await readRows()).length, 1, '真实外部更新使旧删除确认失效');
        await action('delete').click(); await action('select-all-delete').click(); await confirm();
        assert.deepEqual(await readRows(), []);
        assert.match(await panel.locator('.yuzi-bottom-empty').textContent(), /暂无数据/);
        await reopen(0);
        assert.deepEqual(await readRows(true), [], '删空后刷新仍为空');
        report.results.push({ step: 'empty-reopen', rows: [] });
        assert.deepEqual(pluginErrors, []);
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`PASS: real SillyTavern + shujuku + built phone; persisted insert, sparse row IDs, cancel, locked row, delete, lock remap, refresh/reopen, external update invalidation, empty/reopen. Evidence: ${output}`);
    } catch (error) {
        console.error('Live state:', await page.evaluate(() => ({ sqlRead: typeof window.AutoCardUpdaterAPI?.querySql, sqlWrite: typeof window.AutoCardUpdaterAPI?.executeSqlMutation, fixture: !!window.__yuziDeleteFixture, chat: SillyTavern.getContext().chatId })).catch(() => null));
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        await fs.writeFile(path.join(output, 'failure.txt'), String(error));
        console.error(`Live test evidence: ${output}`);
        throw error;
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
