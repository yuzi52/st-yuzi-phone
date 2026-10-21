// 玉子市场原型：货架、刷新按钮与背包渲染。只读 row，不写回。
(function () {
    'use strict';
    const D = window.SS_DATA;
    const P = window.SS_PARSE;
    const { esc, tierCls } = window.SS_RENDER;
    const $ = (id) => document.getElementById(id);

    function renderOdds(tier) {
        const parts = D.ODDS[tier].map((w, i) => (w ? `${D.TIERS[i].zh}${w}%` : '')).filter(Boolean);
        $('odds').textContent = `「${D.TIERS[tier].name}」出货参考：${parts.join(' · ')}`;
    }

    function itemButton(it, i, points) {
        if (it.soldOut) return '<button type="button" class="ss-btn ghost sm" disabled>已售空</button>';
        const lack = it.price - points;
        if (lack > 0) {
            return `<button type="button" class="ss-btn ghost sm" data-act="buy" data-i="${i}" aria-disabled="true" title="还差 ${lack} 点">差${lack}点</button>`;
        }
        return `<button type="button" class="ss-btn primary sm" data-act="buy" data-i="${i}">购买</button>`;
    }

    // 刷新按钮：已刷新时锁定，点数不足时置灰
    function renderRefresh(row, points) {
        const btn = $('refresh-btn');
        const done = P.parseRefresh(row.refresh);
        btn.disabled = done;
        btn.removeAttribute('aria-disabled');
        if (done) {
            btn.textContent = '已申请刷新';
        } else {
            btn.textContent = `刷新货架 · ${D.REFRESH_COST}点`;
            if (points < D.REFRESH_COST) btn.setAttribute('aria-disabled', 'true');
        }
    }

    // 返回解析后的商品数组，购买时按下标写回
    function renderShop(row, tier) {
        const items = P.parseShop(row.shop);
        const points = P.firstInt(row.points, 0);
        renderOdds(tier);
        renderRefresh(row, points);
        const sold = items.filter((it) => it.soldOut).length;
        $('shop-hint').textContent = P.parseRefresh(row.refresh)
            ? '已申请刷新，下回合整架换新'
            : `共 ${items.length} 件${sold ? ` · 售空 ${sold} 件` : ''} · 不会自动补货`;
        if (!items.length) {
            $('shop').innerHTML = '<p class="ss-empty">货架还没进货，等玉子下一回合上架</p>';
            return items;
        }
        $('shop').innerHTML = items.map((it, i) => {
            const t = D.TIERS[it.rarity];
            const label = `${it.name}，${t.grade}，${it.price}点${it.soldOut ? '，已售空' : ''}`;
            return `<article class="ss-item ${tierCls(it.rarity)}${it.soldOut ? ' is-sold' : ''}" aria-label="${esc(label)}">`
                + `<div class="ss-item-head"><span class="ss-item-grade">${t.zh}·${t.grade}</span><span class="ss-item-world">${esc(it.world)}</span></div>`
                + `<h3 class="ss-item-name">${esc(it.name)}</h3>`
                + `<p class="ss-item-desc">${esc(it.desc)}</p>`
                + `<div class="ss-item-foot"><span class="ss-price">${it.price}点</span>${itemButton(it, i, points)}</div>`
                + '</article>';
        }).join('');
        return items;
    }

    // 背包物品是按钮，点开看效果、可使用；返回解析结果供点击时取用
    function renderBag(row) {
        const bag = P.parseBag(row.bag);
        $('bag-count').textContent = `${bag.length} 件 · 点击查看`;
        $('bag').innerHTML = bag.length
            ? bag.map((b, i) => `<button type="button" class="ss-bag-item ${tierCls(b.rarity)}" data-act="bag" data-i="${i}" aria-haspopup="dialog">${esc(b.name)}</button>`).join('')
            : '<p class="ss-empty">背包空空如也，去货架逛逛吧</p>';
        return bag;
    }

    window.SS_RENDER.renderShop = renderShop;
    window.SS_RENDER.renderBag = renderBag;
})();
