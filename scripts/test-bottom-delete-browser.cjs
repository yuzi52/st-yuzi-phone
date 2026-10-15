// Run against an isolated SillyTavern host. Database API calls use in-memory fixtures.
// YUZI_TEST_BASE_URL=http://127.0.0.1:PORT
// YUZI_TEST_PLAYWRIGHT=/path/to/playwright YUZI_TEST_BROWSER=/path/to/chromium
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.YUZI_TEST_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.YUZI_TEST_BASE_URL;
if (!base) throw new Error('Set YUZI_TEST_BASE_URL to an isolated SillyTavern instance.');

async function main() {
    const browser = await chromium.launch({ executablePath: process.env.YUZI_TEST_BROWSER || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    const prefix = '/scripts/extensions/third-party/st-yuzi-phone/';
    const errors = [];
    page.on('pageerror', error => { if (String(error.stack).includes('st-yuzi-phone')) errors.push(String(error)); });
    // This suite covers deterministic error/selection cases; real persistence has a separate suite.
    await page.route('**/scripts/extensions/third-party/shujuku/index.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(`**${prefix}**`, async route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
        const file = path.resolve(root, pathname.slice(prefix.length));
        if (!file.startsWith(root + path.sep)) return route.abort();
        if (file.endsWith('/dist/yuzi-phone.bundle.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        try { await route.fulfill({ contentType: type, body: await fs.readFile(file) }); }
        catch { await route.fulfill({ status: 404, body: '' }); }
    });
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.SillyTavern?.getContext?.().extensionSettings, undefined, { timeout: 90000 });
        await page.locator('#preloader').waitFor({ state: 'hidden', timeout: 90000 });
        if (await page.locator('.onboarding:visible').count()) {
            await page.locator('.popup-input:visible').fill('Yuzi browser test');
            await page.locator('.popup-button-ok:visible').click();
        }
        await page.waitForFunction(() => window.SillyTavern.getContext().characters.length > 0);
        await page.evaluate(async prefix => {
            const fixture = window.__yuziDeleteFixture = { callbacks: new Set(), calls: [], raw: {}, locks: {} };
            fixture.emit = () => { for (const callback of fixture.callbacks) callback(fixture.raw); };
            fixture.reset = () => {
                fixture.raw = {
                    sheet_test: { name: '删除测试表', sourceData: { ddl: 'CREATE TABLE delete_test (row_id INTEGER, content TEXT)' }, content: [['row_id', '内容'], [7, '甲：保留原始行号'], [12, '乙：锁定记录'], [18, '丙：删除目标'], [25, '丁：其余记录']] },
                    sheet_other: { name: '其他表', content: [['row_id', '内容'], [1, '另一张表']] },
                };
                fixture.locks = { rows: [1], cols: [], cells: [] };
                fixture.calls = []; fixture.emit();
            };
            window.AutoCardUpdaterAPI = {
                exportTableAsJson: () => structuredClone(fixture.raw),
                getTableLockState: () => structuredClone(fixture.locks),
                setTableLockState(_key, next) { fixture.locks = next; return true; },
                registerTableUpdateCallback(callback) { fixture.callbacks.add(callback); },
                unregisterTableUpdateCallback(callback) { fixture.callbacks.delete(callback); },
                async executeSqlMutation(sql, ids) {
                    fixture.calls.push({ sql, ids });
                    const before = fixture.raw.sheet_test.content.length;
                    fixture.raw.sheet_test.content = fixture.raw.sheet_test.content.filter((row, index) => !index || !ids.includes(row[0]));
                    fixture.emit();
                    return { saved: true, changes: before - fixture.raw.sheet_test.content.length, errors: [] };
                },
            };
            fixture.reset();
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = prefix + 'dist/yuzi-phone.bundle.css'; document.head.append(link);
            const settings = await import(prefix + 'modules/settings.js');
            window.__yuziTestSettings = settings;
            settings.savePhoneSettingsPatch({ enabled: true, phoneLanguage: 'zh-CN', bottomVisualization: { ...settings.getPhoneSettings().bottomVisualization, enabled: true, position: 'fixed' } });
            const bottom = await import(prefix + 'modules/bottom-visualization/index.js');
            bottom.startBottomVisualization();
        }, prefix);
        await page.evaluate(() => {
            const settings = window.__yuziTestSettings;
            settings.savePhoneSettingsPatch({ enabled: true, bottomVisualization: { ...settings.getPhoneSettings().bottomVisualization, enabled: true, position: 'fixed' } });
        });
        const panel = page.locator('.yuzi-bottom-panel');
        const action = name => panel.locator(`[data-action="${name}"]`);
        const tab = key => page.locator(`.yuzi-bottom-tab[data-sheet="${key}"]`);
        const row = index => panel.locator(`[data-action="toggle-delete-row"][data-row-index="${index}"]`);
        async function reset() { await page.evaluate(() => window.__yuziDeleteFixture.reset()); }
        async function begin() { await action('delete').click(); await action('select-all-delete').waitFor(); }
        async function confirm() { await action('delete-selected').click(); await panel.locator('.phone-confirm-dialog-confirm').click(); await action('delete').waitFor(); }
        async function config(patch) {
            await page.evaluate(patch => { const settings = window.__yuziTestSettings; settings.savePhoneSetting('bottomVisualization', { ...settings.getPhoneSettings().bottomVisualization, ...patch }); }, patch);
        }

        await tab('sheet_test').click();
        await begin();
        assert.equal(await row(1).isDisabled(), true, '锁定记录不可选');
        await action('select-all-delete').click();
        assert.match(await action('delete-selected').textContent(), /3/);
        await action('clear-delete').click();
        assert.equal(await action('delete-selected').isDisabled(), true);
        await row(2).click();
        await action('delete-selected').click();
        await panel.locator('.phone-confirm-dialog-cancel').click();
        assert.equal(await page.evaluate(() => window.__yuziDeleteFixture.calls.length), 0, '取消确认不得调用删除');
        await confirm();
        assert.deepEqual(await page.evaluate(() => window.__yuziDeleteFixture.calls[0].ids), [18]);
        assert.equal(await panel.locator('.yuzi-bottom-card').count(), 3);

        await reset();
        await config({ sortDescendingBySheet: { sheet_test: true } });
        await begin();
        assert.equal(await panel.locator('[data-action="toggle-delete-row"]').first().getAttribute('data-row-index'), '3');
        await row(0).click(); await confirm();
        assert.deepEqual(await page.evaluate(() => window.__yuziDeleteFixture.calls[0].ids), [7], '倒序删除仍按原始行映射');

        await reset(); await begin(); await row(2).click(); await action('delete-selected').click();
        await page.evaluate(() => { const f = window.__yuziDeleteFixture; f.raw.sheet_test.content.splice(1, 1); f.emit(); });
        assert.equal(await panel.locator('.phone-confirm-dialog-overlay').count(), 0, '表变化时销毁旧确认框');
        assert.equal(await action('select-all-delete').count(), 0);
        assert.equal(await page.evaluate(() => window.__yuziDeleteFixture.calls.length), 0);

        await reset(); await begin(); await row(0).click(); await tab('sheet_other').click();
        assert.equal(await action('select-all-delete').count(), 0, '切表清除旧选择');
        await tab('sheet_test').click(); await begin(); await action('close').click();
        await tab('sheet_test').click(); assert.equal(await action('select-all-delete').count(), 0, '关闭后不恢复旧选择');
        await action('edit').click(); assert.ok(await panel.locator('textarea[data-input-col]').count() > 0, '原编辑入口可用');
        await action('cancel-edit').click();

        await page.setViewportSize({ width: 390, height: 844 });
        await config({ layout: 'horizontal' });
        await begin(); await row(2).click();
        const output = await fs.mkdtemp(path.join(os.tmpdir(), 'yuzi-bottom-delete-browser-'));
        await page.screenshot({ path: path.join(output, 'mobile-delete.png'), fullPage: true });
        await confirm();
        assert.deepEqual(await page.evaluate(() => window.__yuziDeleteFixture.calls[0].ids), [18]);

        await reset();
        await page.evaluate(() => { window.__yuziDeleteFixture.locks.rows = []; window.__yuziDeleteFixture.emit(); });
        await begin(); await action('select-all-delete').click(); await confirm();
        assert.match(await panel.locator('.yuzi-bottom-empty').textContent(), /暂无数据/);
        assert.deepEqual(errors, [], '插件不得产生未处理的浏览器错误');
        console.log(`PASS: SillyTavern host + bottom runtime; selection, cancel, delete, locking, reverse order, external updates, table/close reset, editing, mobile horizontal layout, empty table. Screenshots: ${output}`);
    } catch (error) {
        console.error('Bottom panel state:', await page.evaluate(() => ({
            settings: window.__yuziTestSettings?.getPhoneSettings().bottomVisualization,
            keys: Object.keys(window.AutoCardUpdaterAPI?.exportTableAsJson?.() || {}),
            roots: document.querySelectorAll('.yuzi-bottom-root').length,
        })).catch(() => null));
        throw error;
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
