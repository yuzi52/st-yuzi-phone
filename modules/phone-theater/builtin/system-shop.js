import { getTableData, updateTableRow } from '../../phone-core/data-api.js';
import { showConfirmDialog, showAlertDialog } from '../../settings-app/ui/confirm-dialog.js';
import { createRuntimeScope } from '../../runtime-manager.js';
import { Logger } from '../../error-handler.js';
import { buildBuiltinTheaterNav } from './navigation.js';
import { renderShopContent } from './system-shop-view.js';
import { SHOP_NAME, FIELDS, TIERS, REFRESH_COST, firstInt, readShopRow, buildShopViewModel, parseStatus, parseShop, refreshPending, serializeShop, appendBag } from './system-shop-model.js';

export function mount(context) {
    const { root, signal } = context;
    const runtime = createRuntimeScope('theater-system-shop');
    const sheetKey = context.getState().sheetKey;
    let displayed = null, rowSignature, saving = false;
    root.innerHTML = `<section class="yuzi-theater-shop" data-phone-bottom-bar="docked">${buildBuiltinTheaterNav('systemShop', context.getState().tableName || SHOP_NAME)}<main class="yuzi-theater-shop-scroll"><div class="yuzi-theater-shop-content"></div><p class="yuzi-theater-shop-notice">填表过程中不要购买东西哦~亲~</p></main></section>`;
    const page = root.firstElementChild;
    const content = root.querySelector('.yuzi-theater-shop-content');
    const scroll = root.querySelector('.yuzi-theater-shop-scroll');
    page.dataset.theme = context.theme.mode;
    const active = () => !signal.aborted && context.isCurrent();
    const confirm = (title, message, callback, label = '确认') => showConfirmDialog(root, title, message, () => { if (active()) callback(); }, label, '取消', runtime);

    function readCurrent() {
        const table = getTableData()?.[sheetKey];
        const values = table?.content?.[1];
        if (!values) return null;
        const fields = Object.fromEntries(table.content[0].map((header, index) => [String(header).trim(), values[index]]));
        return { tableName: table.name, row: readShopRow(fields) };
    }

    // 更新通知与保存回读共用入口，同一行未变时不重复解析或重建 DOM。
    function renderRow(row) {
        if (!active()) return;
        const signature = JSON.stringify(row);
        if (signature === rowSignature) return;
        rowSignature = signature;
        const previousTier = displayed?.title.tier;
        displayed = buildShopViewModel(row);
        const scrollTop = scroll.scrollTop;
        content.innerHTML = renderShopContent(displayed);
        scroll.scrollTop = scrollTop;
        const tier = displayed?.title.tier;
        if (previousTier !== undefined && tier > previousTier) {
            showAlertDialog(root, '称号晋升', `晋升为「${TIERS[tier].name}」！系统商店为你解锁了更多「${TIERS[tier].grade}」级商品。`, '收下这份荣耀', runtime);
        }
    }

    function render(state = context.getState()) {
        if (!active()) return;
        // 底部仍沿用宿主的标题栏限制，商店内容操作与 App 共用。
        root.querySelector('#yuzi-theater-systemShop-prev').disabled = context.readOnly || !state.canPrevious;
        root.querySelector('#yuzi-theater-systemShop-next').disabled = context.readOnly || !state.canNext;
        root.querySelector('[data-action="editCurrentTable"]').disabled = context.readOnly;
        renderRow(readShopRow(state.records.find(entry => entry.rowIndex === 0)?.fields));
    }

    // 按下确认才读取当前行，部分字段由现有 updateTableRow 一次提交。
    // 不监听填表忙碌状态；购买时机由页面底部提醒告知用户。
    async function commit(change) {
        if (!active() || saving) return;
        const current = readCurrent();
        if (!current) return;
        const patch = change(current.row);
        if (!patch) return;
        saving = true;
        try {
            const data = Object.fromEntries(Object.entries(patch).map(([key, value]) => [FIELDS[key], value]));
            const result = await updateTableRow(current.tableName, 1, data, { isCurrent: active });
            if (!active()) return;
            if (!result?.ok) return;
            const latest = readCurrent();
            if (latest) renderRow(latest.row);
        } catch (error) {
            Logger.warn({ action: 'system-shop.save', message: '系统商店保存失败', error });
        } finally { saving = false; }
    }

    function buy(index) {
        const selected = displayed?.items[index];
        if (!selected || selected.soldOut) return;
        confirm(`购买「${selected.name}」？`, `花费 ${selected.price} 点，购买后放进我的背包。`, () => {
            void commit(row => {
                const items = parseShop(row.shop), item = items[index], points = firstInt(row.points);
                if (!item || item.soldOut || item.raw !== selected.raw || points < item.price) return null;
                item.soldOut = true;
                return { points: String(points - item.price), bag: appendBag(row.bag, item), shop: serializeShop(items) };
            });
        }, '购买');
    }

    function refresh() {
        confirm('刷新货架？', `花费 ${REFRESH_COST} 点，下回合玉子会把整个货架换新。`, () => {
            void commit(row => {
                const points = firstInt(row.points);
                if (refreshPending(row.refresh) || points < REFRESH_COST) return null;
                return { points: String(points - REFRESH_COST), refresh: '已刷新' };
            });
        }, '刷新');
    }

    function abandon() {
        const task = displayed?.row.task;
        confirm('放弃当前委托？', '放弃不扣点数，但也拿不到奖励。下回合玉子会发布新委托。', () => {
            void commit(row => {
                if (row.task !== task || parseStatus(row.status) !== 'active') return null;
                return { status: '已放弃' };
            });
        }, '放弃');
    }

    function openBag(index) {
        const item = displayed?.bag[index];
        if (!item) return;
        const tier = TIERS[item.rarity];
        const description = `${tier.zh}·${tier.grade}${item.world ? ` · ${item.world}` : ''}\n\n${item.description || '（没有记录效果）'}`;
        confirm(item.name, description, () => {
            const composer = document.getElementById('send_textarea');
            if (!composer) return;
            const text = `使用【${item.name}】：${item.description || '（未记录效果）'}`;
            composer.value = composer.value ? `${composer.value.replace(/\s+$/, '')}\n${text}` : text;
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.focus();
        }, '使用');
    }

    const actions = { buy, refresh, abandon, bag: openBag };
    page.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || button.disabled || !active()) return;
        if (button.dataset.action) { context.actions[button.dataset.action]?.(); return; }
        const action = button.dataset.shopAction;
        actions[action]?.(Number(button.dataset.index));
    }, { signal });
    const unsubscribe = context.subscribe(render);
    render();
    return () => { unsubscribe(); runtime.dispose(); };
}
