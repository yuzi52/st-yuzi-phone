// 玉子市场原型：状态、前端回填（购买 / 刷新 / 放弃 / 使用道具）与测试面板。
(function () {
    'use strict';
    const D = window.SS_DATA, P = window.SS_PARSE, R = window.SS_RENDER, UI = window.SS_UI, SIM = window.SS_SIM;
    const $ = (id) => document.getElementById(id);
    const FIELDS = [['task', '任务'], ['status', '状态'], ['bag', '系统背包（仅前端写）'], ['shop', '商店'], ['refresh', '刷新状态'], ['points', '点数'], ['title', '称号']];
    let row, items = [], bag = [], lastPoints = null;

    function log(by, msg) {
        const li = document.createElement('li');
        li.className = `by-${by}`;
        li.innerHTML = `<b>${{ ai: 'AI', ui: '前端', dev: '测试' }[by]}</b>${R.esc(msg)}`;
        $('log').prepend(li);
    }

    function render(skipCell) {
        const t = R.renderHead(row);
        R.renderTask(row);
        items = R.renderShop(row, t.tier);
        bag = R.renderBag(row);
        $('dev-tier').value = String(t.tier);
        const pts = P.firstInt(row.points, 0);
        if (lastPoints !== null && pts !== lastPoints) {
            const el = $('points');
            el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        }
        lastPoints = pts;
        FIELDS.forEach(([k]) => { if (k !== skipCell) $(`cell-${k}`).value = row[k] ?? ''; });
    }

    function reset() {
        row = { ...D.INITIAL };
        row.shop = SIM.genShop(P.parseTitle(row.title).tier, P.firstInt(row.points, 0));
        lastPoints = null;
        $('log').innerHTML = '';
        log('dev', '已重置为初始行');
        render();
    }

    function buy(i) {
        const it = items[i];
        if (!it || it.soldOut) return;
        const pts = P.firstInt(row.points, 0);
        if (it.price > pts) return UI.toast(`点数不足，还差 ${it.price - pts} 点`);
        UI.confirm({
            title: `购买「${it.name}」？`,
            message: `花费 ${it.price} 点，剩余 ${pts - it.price} 点。购买后放进我的背包。`,
            confirmText: '购买',
            onConfirm: () => {
                const latestItems = P.parseShop(row.shop);
                const latest = latestItems[i];
                const currentPoints = P.firstInt(row.points, 0);
                if (!latest || latest.soldOut || latest.raw !== it.raw) return UI.toast('货架已更新，请重新选择商品');
                if (currentPoints < latest.price) return UI.toast(`点数不足，还差 ${latest.price - currentPoints} 点`);
                // 一次写回三格：点数、背包（带效果）、商店售空标记
                row.points = String(currentPoints - latest.price);
                row.bag = P.appendBag(row.bag, P.bagEntry(latest));
                latest.soldOut = true;
                row.shop = P.serializeShop(latestItems);
                log('ui', `购买「${it.name}」：点数 −${it.price}，背包追加（含效果），商店标记【已售空】`);
                UI.toast(`已放进背包：${it.name}`);
                render();
            },
        });
    }

    function refresh() {
        if (P.parseRefresh(row.refresh)) return UI.toast('已经申请过了，下回合整架换新');
        const pts = P.firstInt(row.points, 0);
        if (pts < D.REFRESH_COST) return UI.toast(`点数不足，刷新需要 ${D.REFRESH_COST} 点`);
        UI.confirm({
            title: '刷新货架？',
            message: `花费 ${D.REFRESH_COST} 点，剩余 ${pts - D.REFRESH_COST} 点。下回合玉子会把整个货架换新。`,
            confirmText: '刷新',
            onConfirm: () => {
                if (P.parseRefresh(row.refresh)) return UI.toast('已经申请过了，下回合整架换新');
                const currentPoints = P.firstInt(row.points, 0);
                if (currentPoints < D.REFRESH_COST) return UI.toast(`点数不足，刷新需要 ${D.REFRESH_COST} 点`);
                row.points = String(currentPoints - D.REFRESH_COST);
                row.refresh = D.REFRESH.yes;
                log('ui', `刷新货架：点数 −${D.REFRESH_COST}，刷新状态写为「已刷新」`);
                render();
            },
        });
    }
    function abandon() {
        UI.confirm({
            title: '放弃当前委托？', message: '放弃不扣点数，但也拿不到奖励。下回合玉子会发布新委托。',
            confirmText: '放弃', danger: true,
            onConfirm: () => { row.status = D.STATUS.abandon; log('ui', '状态写为「已放弃」'); render(); },
        });
    }

    // 使用道具：写入酒馆输入框（#send_textarea），不发送；背包不扣除
    function useItem(item) {
        const composer = document.getElementById('send_textarea');
        if (!composer) return UI.toast('没找到酒馆输入框');
        const text = `使用【${item.name}】：${item.desc || '（未记录效果）'}`;
        const cur = composer.value;
        composer.value = cur ? `${cur.replace(/\s+$/, '')}\n${text}` : text;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.focus();
        log('ui', `使用「${item.name}」：已写入输入框，未发送`);
        UI.toast('已写入输入框，确认后再发送');
    }

    function openBag(i) {
        const it = bag[i];
        if (it) UI.itemDetail(it, useItem);
    }

    function aiTurn(outcome) {
        $('sync').hidden = false;
        setTimeout(() => {
            const res = SIM.aiTurn(row, outcome);
            row = res.row;
            res.notes.forEach((n) => log('ai', n));
            $('sync').hidden = true;
            render();
            if (res.levelUp >= 0) UI.levelUp(res.levelUp);
        }, 450);
    }

    // 测试面板：单元格编辑器与称号阶选择
    function buildDev() {
        $('cells').innerHTML = FIELDS.map(([k, label]) => `<label>${label}<textarea id="cell-${k}" data-cell="${k}" rows="${k === 'shop' || k === 'bag' ? 5 : 2}"></textarea></label>`).join('');
        $('cells').addEventListener('input', (e) => {
            const k = e.target.dataset.cell;
            if (!k) return;
            row[k] = e.target.value;
            render(k);
        });
        $('dev-tier').innerHTML = D.TIERS.map((t, i) => `<option value="${i}">${t.zh}·${t.name}（累计 ${t.min}+）</option>`).join('');
        $('dev-tier').addEventListener('change', (e) => {
            const i = Number(e.target.value);
            row.title = P.formatTitle(D.TIERS[i].min);
            row.shop = SIM.genShop(i, P.firstInt(row.points, 0));
            log('dev', `称号切到「${D.TIERS[i].name}」，按该阶刷新货架`);
            render();
        });
    }

    const DEV = {
        win: () => aiTurn('win'),
        lose: () => aiTurn('lose'),
        turn: () => aiTurn('none'),
        rich: () => { row.points = String(P.firstInt(row.points, 0) + 500); log('dev', '点数 +500'); render(); },
        theme: () => { const p = $('phone'); p.dataset.theme = p.dataset.theme === 'dark' ? 'light' : 'dark'; },
        reset,
    };
    const ACT = { buy: (b) => buy(Number(b.dataset.i)), bag: (b) => openBag(Number(b.dataset.i)), refresh, abandon };

    document.querySelector('.dev-btns').addEventListener('click', (e) => {
        const b = e.target.closest('[data-dev]');
        if (b) DEV[b.dataset.dev]();
    });

    // 小手机内的按钮：购买、刷新、放弃委托、打开背包物品；aria-disabled 的按钮仍可点，用来提示差多少点
    document.querySelector('.ss-scroll').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const fn = ACT[b.dataset.act];
        if (fn) fn(b);
    });

    // 标题栏按钮在原型里只提示，正式接入时走小剧场公共导航
    document.querySelector('.phone-nav-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-toast]');
        if (b) UI.toast(`原型：${b.dataset.toast}`);
    });

    buildDev();
    reset();
})();

