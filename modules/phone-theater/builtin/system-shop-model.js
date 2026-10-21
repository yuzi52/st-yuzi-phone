// 系统商店的七列协议；只解析数据，不生成任务或商品，不操作数据库。
export const SHOP_NAME = '系统商店';
export const FIELDS = Object.freeze({ task: '任务', status: '状态', bag: '系统背包', shop: '商店', refresh: '刷新状态', points: '点数', title: '称号' });
export const REFRESH_COST = 10;
export const TIERS = Object.freeze([
    { key: 'green', zh: '绿', grade: '普通', name: '麻糬见习生', min: 0 },
    { key: 'blue', zh: '蓝', grade: '精良', name: '商店街看板娘', min: 3 },
    { key: 'purple', zh: '紫', grade: '史诗', name: '放课后茶会VIP', min: 8 },
    { key: 'orange', zh: '橙', grade: '传说', name: '邪王真眼继承者', min: 15 },
    { key: 'red', zh: '红', grade: '神话', name: '金牌自动手记人偶', min: 25 },
    { key: 'black', zh: '黑', grade: '禁忌', name: 'SOS团至高团长', min: 40 },
]);
export const ODDS = Object.freeze([
    [60, 30, 10, 0, 0, 0], [40, 35, 20, 5, 0, 0], [20, 35, 30, 12, 3, 0],
    [0, 25, 35, 28, 10, 2], [0, 0, 25, 35, 30, 10], [0, 0, 10, 30, 35, 25],
]);
export const STATUS = Object.freeze({ active: '进行中', done: '已完成', fail: '已失败', abandon: '已放弃' });
export const firstInt = (value, fallback = 0) => Number.parseInt(String(value ?? '').match(/-?\d+/)?.[0] ?? fallback, 10);
const split = value => String(value ?? '').split(/[;；\n]+/).map(part => part.trim()).filter(Boolean);
const rarityOf = value => Math.max(0, TIERS.findIndex(tier => value.includes(tier.zh) || value.includes(tier.grade)));

export function readShopRow(fields) {
    return fields ? Object.fromEntries(Object.entries(FIELDS).map(([key, header]) => [key, String(fields[header] ?? '')])) : null;
}

export function parseTitle(value) {
    const raw = String(value ?? '');
    const count = firstInt(raw.match(/累计完成\s*(\d+)/)?.[1]);
    let tier = 0;
    TIERS.forEach((entry, index) => { if (count >= entry.min) tier = index; });
    const name = raw.replace(/[（(][^）)]*[）)]/g, '').split(/[·・]/).pop().trim();
    return { raw, count, tier, name: name || TIERS[tier].name };
}

export function parseStatus(value) {
    return Object.entries(STATUS).find(([key, label]) => key !== 'active' && String(value ?? '').includes(label))?.[0] || 'active';
}

export const refreshPending = value => String(value ?? '').includes('已刷新');

export function parseTask(value) {
    const raw = String(value ?? '').trim();
    const [type = '', difficulty = ''] = raw.match(/^【([^】]*)】/)?.[1].split(/[·・\/]/) || [];
    const rewards = [...raw.matchAll(/(\d+)\s*点/g)];
    const reward = firstInt(rewards.at(-1)?.[1]);
    const body = raw.replace(/^【[^】]*】/, '').replace(/[（(]\s*奖励\s*\d+\s*点\s*[）)]\s*$/, '').trim();
    const cut = body.search(/[：:]/);
    return { type: type.trim(), difficulty: difficulty.trim(), reward, name: cut > 0 ? body.slice(0, cut).trim() : '', description: cut > 0 ? body.slice(cut + 1).trim() : body };
}

function splitWorld(value) {
    const text = String(value ?? '').trim();
    const dot = text.search(/[·・]/);
    return dot > 0 ? { world: text.slice(0, dot).trim(), description: text.slice(dot + 1).trim() } : { world: '', description: text };
}

export function parseShop(value) {
    return split(value).map(segment => {
        const soldOut = segment.includes('已售空');
        const raw = segment.replace(/【?已售空】?/g, '').trim();
        const parts = raw.split(/[｜|]/).map(part => part.trim());
        if (parts.length < 3) return { raw, soldOut, rarity: 0, name: raw, price: firstInt(raw), world: '', description: '' };
        return { raw, soldOut, rarity: rarityOf(parts[0]), name: parts[1], price: firstInt(parts[2]), ...splitWorld(parts.slice(3).join('｜')) };
    });
}

export const serializeShop = items => items.map(item => `${item.soldOut ? '【已售空】' : ''}${item.raw}`).join(';');

export function parseBag(value) {
    const text = String(value ?? '').trim();
    if (!text || text === '空') return [];
    return split(text).map(raw => {
        const parts = raw.split(/[｜|]/).map(part => part.trim());
        if (parts.length >= 2) return { raw, rarity: rarityOf(parts[0]), name: parts[1], ...splitWorld(parts.slice(2).join('｜')) };
        const match = raw.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
        const rarity = match ? TIERS.findIndex(tier => match[2].includes(tier.zh) || match[2].includes(tier.grade)) : -1;
        return { raw, rarity: Math.max(0, rarity), name: rarity >= 0 ? match[1].trim() : raw, world: '', description: '' };
    });
}

export function appendBag(value, item) {
    const text = String(value ?? '').trim();
    const entry = `${TIERS[item.rarity].zh}｜${item.name}｜${item.world ? `${item.world}·` : ''}${item.description}`;
    return !text || text === '空' ? entry : `${text.replace(/[;；\s]+$/, '')};${entry}`;
}

export function buildShopViewModel(row) {
    return row ? {
        row,
        title: parseTitle(row.title),
        task: parseTask(row.task),
        status: parseStatus(row.status),
        points: firstInt(row.points),
        items: parseShop(row.shop),
        bag: parseBag(row.bag),
        pending: refreshPending(row.refresh),
    } : null;
}
