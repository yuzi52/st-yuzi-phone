import { mount } from '../builtin/system-shop.js';
import { SHOP_NAME, FIELDS } from '../builtin/system-shop-model.js';

export const systemShopScene = Object.freeze({
    id: 'systemShop',
    appKey: '__theater_system_shop',
    name: SHOP_NAME,
    title: SHOP_NAME,
    iconText: '系',
    iconColors: ['#7FB08A', '#4F8A5D'],
    orderNo: 6,
    subtitle: '今日委托、市场货架与我的背包',
    emptyText: '系统商店还没开张，等下一回合发布委托',
    styleScope: 'system-shop',
    primaryTableRole: 'shop',
    deletable: false,
    tables: Object.freeze({ shop: SHOP_NAME }),
    editableTables: Object.freeze([{ role: 'shop', label: '编辑系统商店', description: '进入原始系统商店表' }]),
    fieldSchema: Object.freeze({ shop: Object.freeze({ identity: 'row_id', ...FIELDS }) }),
    contract: Object.freeze({ styleFile: 'styles/phone-theater/system-shop.css', requiredClasses: ['yuzi-theater-shop'] }),
    // 内置页面从共享快照读取；保留 scene 契约，不重复构建未使用的数据。
    buildViewModel: () => ({}),
    collectDeletableKeys: () => [],
    deleteEntities: () => ({ removed: 0 }),
    renderContent: () => '',
    mountBuiltin: mount,
});
