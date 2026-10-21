# Theater Scene 扩展规范

本文档定义小剧场 scene 的接入契约。目标不是把“广场 / 论坛 / 直播”再硬编码一遍，而是让新增类似小剧场表时，只需要新增 scene module、scene 样式，并在注册表与样式入口登记。

## 1. 文件结构

新增一个小剧场入口时，按以下结构接入：

```text
modules/phone-theater/scenes/new-scene.js
styles/phone-theater/new-scene.css
```

然后登记：

- 在 [`modules/phone-theater/scenes/index.js`](../../modules/phone-theater/scenes/index.js) 导入并加入 `RAW_THEATER_SCENES`。
- 在 [`styles/phone-theater/index.css`](../../styles/phone-theater/index.css) 增加 `@import url('./new-scene.css');`。
- 如有新增约束，更新 [`scripts/check-theater-contract.cjs`](../../scripts/check-theater-contract.cjs)。

不要修改 [`modules/phone-theater/data.js`](../../modules/phone-theater/data.js)、[`modules/phone-theater/templates.js`](../../modules/phone-theater/templates.js)、[`modules/phone-theater/delete-service.js`](../../modules/phone-theater/delete-service.js)、[`modules/phone-theater/render.js`](../../modules/phone-theater/render.js) 或 [`modules/phone-theater/interactions.js`](../../modules/phone-theater/interactions.js) 来塞场景分支。那不是扩展，是重新制造硬编码债务。

## 2. Scene module 必填契约

每个 scene module 必须导出一个冻结对象，例如：

```js
export const newScene = Object.freeze({
    id: 'newScene',
    appKey: '__theater_new_scene',
    name: '新场景',
    iconText: '新',
    iconColors: ['#8E8E93', '#636366'],
    orderNo: 4,
    title: '新场景',
    subtitle: '展示说明',
    emptyText: '暂无内容',
    styleScope: 'new-scene',
    primaryTableRole: 'items',
    tables: Object.freeze({
        items: '新场景主表',
        details: '新场景附表',
    }),
    fieldSchema: Object.freeze({
        items: Object.freeze({ identity: '项目ID' }),
        details: Object.freeze({ parentRef: '关联项目ID' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/new-scene.css',
        requiredClasses: ['phone-theater-new-scene-page'],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
    bindInteractions,
});
```

字段含义：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | scene 类型唯一标识，会生成 `theater:${id}` 路由。 |
| `appKey` | 是 | 首页虚拟 app key，必须全局唯一。 |
| `name` / `title` / `emptyText` | 是 | 首页、导航栏和空态显示文案。 |
| `iconText` / `iconColors` / `orderNo` | 是 | 首页入口图标与排序。 |
| `styleScope` | 是 | 页面根节点会输出 `data-theater-style-scope`，同时建议 CSS 使用 `data-theater-scene` 作用域。 |
| `primaryTableRole` | 是 | 决定 scene 是否可用的主表 role。主表缺失时不会生成虚拟入口。 |
| `tables` | 是 | role 到表名的映射。一个表名只能属于一个 scene。scene 可以是单表，也可以按需要扩展为多表。 |
| `fieldSchema` | 建议 | 描述身份字段、外键字段和业务字段，供文档与契约检查使用。 |
| `contract` | 建议 | 描述样式文件和关键 class，供契约脚本检查。 |
| `buildViewModel` | 是 | 从 resolved tables 构建渲染所需 content。 |
| `collectDeletableKeys` | 是 | 返回当前页面所有可删除实体的 typed delete key。 |
| `deleteEntities` | 是 | 执行主表删除；如果 scene 确实有附表，再按明确外键做级联。 |
| `renderContent` | 是 | 返回 scene 内容 HTML。 |
| `bindInteractions` | 可选 | 场景专属交互，例如直播弹幕暂停。 |
| `editableTables` | 可选 | 美化页可进入编辑的原始表列表。单表直接跳转，多表由 shell 弹出选择菜单。 |

### 2.1 editableTables 编辑桥契约

`editableTables` 用于声明“小剧场美化页 → 原始通用表列表”的统一编辑入口。它不渲染表内容，只描述哪些 scene table role 可以被编辑。

示例：

```js
editableTables: Object.freeze([
    Object.freeze({
        role: 'items',
        label: '编辑主表',
        description: '进入原始主表列表',
    }),
])
```

规则：

1. `role` 必须存在于同一 scene 的 `tables` 中；registry 会在启动时校验，写错 role 应立即失败。
2. 当前 scene 只有一个可用编辑表时，右上“编辑”按钮直接导航到 `table-generic:<sheetKey>`。
3. 当前 scene 有多个可用编辑表时，右上“编辑”按钮打开表选择菜单，菜单项再导航到 `table-generic:<sheetKey>`。
4. `table-generic:<sheetKey>` 是强制通用表列表桥。它必须跳过 Theater scene 重定向与 content preset 查询，直接进入原始表的通用列表页。
5. 首次编辑通过普通 route history push 进入。用户在原始通用表列表点击返回时，必须先回到当前小剧场美化页。
6. 仅在 `table:<sheetKey>` 跨表浏览后再次编辑时，核心交互层可以替换 history 顶部的旧 Theater / 兼容 App / 物理表浏览锚点，再压入当前 Theater。不得清空全局 history，也不得替换审核来源。
7. 编辑 route 渲染失败必须恢复点击前的 history；过期 render token 的失败不得回滚更新后的导航状态。
8. 缺失或当前 rawData 中不可用的表项不得触发无效导航；UI 应隐藏或禁用该项。

不要在 scene 的 `bindInteractions` 中自己手搓 `app:${sheetKey}` 跳转，也不要直接 import Table Viewer 或手写返回目标。那会重新进入普通 App 分流，并破坏“编辑后返回美化页”的交互合同。标准做法是统一走 `table-generic:<sheetKey>`。

### 2.4 物理表导航锚点

所有真实 `sheet_*` 表都会进入统一物理目录，顺序只来自 `getSheetKeys(rawData)`。Theater scene 不拥有独立排序，也不得按 `tables` 声明顺序重排全局表目录。

- `table:<sheetKey>` 是表级循环切换和审核 Theater 分流使用的物理锚点 route。
- `theater:<sceneId>` 是显式 scene 入口；缺少传入锚点时优先使用 `primaryTableRole` 对应的实际 `sheetKey`，主表不可用但 scene 其他物理表仍存在时，按 `getSheetKeys(rawData)` 的全局顺序选择稳定首项。
- 同一 scene 包含多个物理表时，`table:<sheetKey>` 必须保留用户实际进入的 `sheetKey`，不能统一改写成主表。
- `app:<sheetKey>` 仅用于兼容既有首页入口，不应成为表级切换目标。
- `table-generic:<sheetKey>` 仍只承担编辑桥和审核原始字段详情，不参与美化页面循环。

公共标题栏由 core templates/render/interactions 提供上一表、下一表控件。scene 模块不得复制目录、路由或监听器。删除管理态和删除执行中必须禁用并阻止切换；页面生命周期失活后不得继续发布 replace。

新增 scene 只要注册正确的表名与 `primaryTableRole`，可用时会自动被统一目录分类为 Theater；resolver 返回空或主表缺失时，物理表仍保留并降级到 Generic。

## 3. 数据读取与 ViewModel

`buildViewModel(resolved, helpers)` 接收：

- `resolved.scene`：当前 scene definition。
- `resolved.tables`：按 `tables` role 解析出的表索引对象。
- `resolved.primaryTable`：主表。
- `helpers`：通用工具函数，包括字段读取、文本归一化、分号拆分、typed delete key 等。

推荐直接从 core helper 导入：

- [`getCellByHeader`](../../modules/phone-theater/core/table-index.js)
- [`mapTheaterRows`](../../modules/phone-theater/core/table-index.js)
- [`normalizeText`](../../modules/phone-theater/core/table-index.js)
- [`resolveRowIdentity`](../../modules/phone-theater/core/table-index.js)
- [`splitSemicolonText`](../../modules/phone-theater/core/table-index.js)
- [`buildTheaterDeleteKey`](../../modules/phone-theater/core/delete-key.js)

辅助表缺失时必须降级为空数组，不得抛错。主表缺失由核心入口处理。

## 4. 删除规则

删除规则必须满足：

1. 主表实体必须使用 typed delete key：`role:rowIndex:encodedIdentity`。
2. 主表删除必须同时匹配 `role`、`rowIndex`、`identity`。
3. 禁止使用裸自然键，例如只用 `帖子标题`、`直播间名` 或自造前缀字符串。
4. 如果 scene 存在附表，级联删除可以按数据模型已有外键字段执行，例如 `关联帖子ID`、`关联帖子标题` 等明确外键。
5. 如果附表外键不是唯一字段，必须在 `fieldSchema` 或本文档中记录限制。

当前内置 `square` / `forum` / `live` / `calendar` / `diary` 均为单表 scene：删除只作用各自主表，继续通过 typed delete key 精确匹配；`calendar` 不开放删除，`diary` 使用 `entry` delete role 删除 `小日记表` 中匹配日记行。

示例：

```js
function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const itemTargets = buildDeleteTargets(selectedSet, 'item');
    const deletedItemIds = new Set();

    const itemDeletion = filterTableRows(tables.items, (row, rowIndex) => {
        const itemId = resolveRowIdentity(tables.items, row, '项目ID', 'item_', rowIndex);
        const matched = hasDeleteTarget(itemTargets, rowIndex, itemId);
        if (matched) deletedItemIds.add(itemId);
        return matched;
    });

    let removed = itemDeletion.removed;
    removed += filterTableRows(tables.details, (row) => {
        const itemRef = normalizeText(getCellByHeader(tables.details, row, '关联项目ID'));
        return deletedItemIds.has(itemRef);
    }).removed;

    return { removed };
}
```

## 5. 渲染规则

`renderContent(viewModel, uiState, renderKit)` 只负责 scene 内容区，不要渲染导航栏、删除管理条或页面根节点。

核心 shell 由 [`modules/phone-theater/templates.js`](../../modules/phone-theater/templates.js) 负责，提供：

- 返回按钮。
- 删除 / 完成按钮。
- 全选、取消选择、删除已选管理条。
- 页面根节点 `data-theater-scene` 与 `data-theater-style-scope`。

scene 内容中的用户数据必须使用转义函数：

- 文本节点使用 `escapeHtml`。
- 属性值使用 `escapeHtmlAttr`。

不要把用户内容直接拼进 HTML。能显示不等于安全，属性注入这类低级错误不该再出现。

## 6. 交互规则

`systemShop` 使用内置 `mountBuiltin(context)`，交易只写「系统商店」当前单行，复用 `updateTableRow()`，不在通用小剧场核心中增加商店分支。内置 context 的 `isCurrent()` 校验页面与聊天归属，`readOnly` 在底部挂载中用于限制公共标题栏导航、原表编辑和删除管理，不用于禁用系统商店内容区的购买、刷新、放弃与使用；这些内容操作和 App 共用实现。导航继续走 `context.actions`，公共确认框随页面卸载清理。

通用删除态由 [`modules/phone-theater/interactions.js`](../../modules/phone-theater/interactions.js) 统一处理。

scene 专属交互放在 `bindInteractions(container, context)`：

- 不要在核心交互层写 scene 专属 selector。
- 重渲染后 DOM 会替换，绑定在元素上的监听会自然释放。
- 如果同一 DOM 可能重复调用 hook，必须使用 dataset 或等价机制防重复绑定。

[`modules/phone-theater/scenes/live.js`](../../modules/phone-theater/scenes/live.js) 的弹幕暂停就是参考实现。

## 7. 样式规则

样式文件结构：

```text
styles/06-phone-theater.css              兼容入口，只 import index
styles/phone-theater/index.css           scene style registry
styles/phone-theater/00-core.css         核心 shell 与通用控件
styles/phone-theater/square.css          广场样式
styles/phone-theater/forum.css           论坛样式
styles/phone-theater/live.css            直播样式
styles/phone-theater/calendar.css        日历样式
styles/phone-theater/diary.css           小日记样式
```

新增 scene 时：

1. 新增 `styles/phone-theater/new-scene.css`。
2. 在 `styles/phone-theater/index.css` 添加 import。
3. CSS 选择器必须以 `.phone-theater-page[data-theater-scene="newScene"]` 或更窄作用域开头。
4. 不要把 scene 专属样式写入 `00-core.css`。
5. `00-core.css` 不允许引用内置 scene 的容器类，例如 `.phone-theater-square-post`、`.phone-theater-forum-note-card`、`.phone-theater-live-room`。删除态这类通用能力必须依赖 `[data-theater-delete-key]` 等跨 scene 协议属性。

## 8. 契约检查

修改后至少运行：

```bash
node scripts/check-theater-contract.cjs
npm run lint --silent
npm run build --silent
```

契约脚本必须覆盖：

- scene module 文件存在。
- registry 中 id / appKey / tableName 唯一。
- 内置 scene 仍注册；新增 scene 必须加入 registry。
- 样式 index 按 core → square → forum → live → calendar → diary 顺序引入。
- `editableTables` role 必须属于 scene `tables`，且编辑入口统一走 `table-generic:<sheetKey>`。
- 公共标题栏表级控件统一走 `table:<sheetKey>` 与 `replaceCurrentRoute()`，不得压入 route history。
- 显式 scene 入口默认锚定 `primaryTableRole`，物理表入口保留传入 `sheetKey`。
- 核心 data/templates/delete-service/render/interactions 不出现 `sceneId === 'square'` 这类分支。
- typed delete key 没有回退。
- 禁止用裸字符串前缀模拟 typed delete key。
- 本文档存在并包含删除规则。

## 9. 新增 scene 最短清单

- [ ] 新增 `modules/phone-theater/scenes/new-scene.js`。
- [ ] 实现 metadata、`tables`、`primaryTableRole`、`fieldSchema`。
- [ ] 实现 `buildViewModel`，缺辅助表时降级为空。
- [ ] 实现 `collectDeletableKeys`，只返回 typed delete key。
- [ ] 实现 `deleteEntities`，主表精确删除，附表按明确外键级联。
- [ ] 实现 `renderContent`，全部用户内容正确转义。
- [ ] 如需从美化页编辑原始表，声明 `editableTables`，并确认会进入 `table-generic:<sheetKey>`。
- [ ] 如有专属交互，实现 `bindInteractions`，确保幂等。
- [ ] 新增 `styles/phone-theater/new-scene.css` 并登记 import。
- [ ] 在 `modules/phone-theater/scenes/index.js` 注册 scene。
- [ ] 更新契约脚本并运行验证。
