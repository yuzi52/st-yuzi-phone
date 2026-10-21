import { escapeHtml as esc } from '../../utils/dom-escape.js';
import { TIERS, ODDS, STATUS, REFRESH_COST } from './system-shop-model.js';

const tierClass = index => `yuzi-theater-shop-tier-${TIERS[index].key}`;
const button = (action, text, { index, disabled = false, soft = false } = {}) => `<button type="button" class="phone-ios-mini-btn yuzi-theater-shop-button${soft ? ' is-soft' : ''}" data-shop-action="${action}"${index === undefined ? '' : ` data-index="${index}"`}${disabled ? ' disabled' : ''}>${esc(text)}</button>`;

function renderHead({ title, points }) {
    const tier = TIERS[title.tier], next = TIERS[title.tier + 1];
    const progress = next ? Math.max(0, Math.min(100, (title.count - tier.min) / (next.min - tier.min) * 100)) : 100;
    return `<section class="yuzi-theater-shop-hero ${tierClass(title.tier)}" aria-label="宿主信息">
        <div class="yuzi-theater-shop-brand">🍡 TAMAKO MARKET</div>
        <div class="yuzi-theater-shop-head">
            <span class="yuzi-theater-shop-badge"><span>${tier.zh}</span>${esc(title.name)}</span>
            <span class="yuzi-theater-shop-points"><b>${points}</b><small>点</small></span>
        </div>
        <div class="yuzi-theater-shop-rank"><span>累计完成 ${title.count} 次</span><span>${next ? `距「${next.zh}·${next.name}」还差 ${next.min - title.count} 次` : '已登顶，万界唯一'}</span></div>
        <progress class="yuzi-theater-shop-progress" aria-label="晋升进度" max="100" value="${progress}"></progress>
    </section>`;
}

function renderTask({ task, status }) {
    const stars = '★'.repeat(({ 简单: 1, 普通: 2, 困难: 3, 噩梦: 4 })[task.difficulty] || 0);
    return `<section class="yuzi-theater-shop-section"><h2 class="yuzi-theater-shop-heading">今日委托</h2>
        <article class="yuzi-theater-shop-task is-${status}">
            <div class="yuzi-theater-shop-task-top">
                ${task.type ? `<span class="yuzi-theater-shop-chip">${esc(task.type)}</span>` : ''}
                <span class="yuzi-theater-shop-difficulty">${stars} ${esc(task.difficulty)}</span>
                <span class="yuzi-theater-shop-status">${STATUS[status]}</span>
            </div>
            <h3 class="yuzi-theater-shop-task-name">${esc(task.name || '系统任务')}</h3>
            <p class="yuzi-theater-shop-task-description">${esc(task.description || '系统还没有发布任务')}</p>
            <div class="yuzi-theater-shop-task-foot"><strong>奖励 +${task.reward} 点</strong>
                ${status === 'active' ? button('abandon', '放弃任务', { soft: true }) : '<span class="yuzi-theater-shop-hint">下回合发布新委托</span>'}
            </div>
        </article>
    </section>`;
}

function renderShelf({ items, points, title, pending }) {
    const odds = ODDS[title.tier].map((weight, index) => weight ? `${TIERS[index].zh}${weight}%` : '').filter(Boolean).join(' · ');
    const sold = items.filter(item => item.soldOut).length;
    return `<section class="yuzi-theater-shop-section">
        <div class="yuzi-theater-shop-section-head"><h2 class="yuzi-theater-shop-heading">市场货架</h2>${button('refresh', pending ? '已申请刷新' : `刷新货架 · ${REFRESH_COST}点`, { soft: true, disabled: pending || points < REFRESH_COST })}</div>
        <p class="yuzi-theater-shop-hint">「${TIERS[title.tier].name}」出货参考：${odds}</p>
        <p class="yuzi-theater-shop-hint">${pending ? '已申请刷新，下回合整架换新' : `共 ${items.length} 件${sold ? ` · 售空 ${sold} 件` : ''} · 不会自动补货`}</p>
        <div class="yuzi-theater-shop-grid">${items.length ? items.map((item, index) => {
            const tier = TIERS[item.rarity], lack = item.price - points;
            return `<article class="yuzi-theater-shop-item ${tierClass(item.rarity)}${item.soldOut ? ' is-sold' : ''}">
                <div class="yuzi-theater-shop-item-head"><span class="yuzi-theater-shop-grade">${tier.zh}·${tier.grade}</span><span class="yuzi-theater-shop-world">${esc(item.world)}</span></div>
                <h3 class="yuzi-theater-shop-item-name">${esc(item.name)}</h3><p class="yuzi-theater-shop-item-description">${esc(item.description)}</p>
                <div class="yuzi-theater-shop-item-foot"><strong>${item.price}点</strong>${button('buy', item.soldOut ? '已售空' : lack > 0 ? `差${lack}点` : '购买', { index, disabled: item.soldOut || lack > 0 })}</div>
            </article>`;
        }).join('') : '<p class="yuzi-theater-shop-hint">货架还没进货，等玉子下一回合上架</p>'}</div>
    </section>`;
}

export function renderShopContent(model) {
    if (!model) return '<p class="yuzi-theater-shop-empty">系统商店还没开张，等下一回合发布委托</p>';
    const { bag } = model;
    return renderHead(model) + renderTask(model) + renderShelf(model)
        + `<section class="yuzi-theater-shop-section"><div class="yuzi-theater-shop-section-head"><h2 class="yuzi-theater-shop-heading">我的背包</h2><span class="yuzi-theater-shop-hint">${bag.length} 件 · 点击查看</span></div>
            <div class="yuzi-theater-shop-bag">${bag.length ? bag.map((item, index) => `<button type="button" class="yuzi-theater-shop-bag-item ${tierClass(item.rarity)}" data-shop-action="bag" data-index="${index}" aria-haspopup="dialog">${esc(item.name)}</button>`).join('') : '<p class="yuzi-theater-shop-hint">背包空空如也，去货架逛逛吧</p>'}</div>
        </section>`;
}
