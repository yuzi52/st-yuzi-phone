# 小手机 UI 变量

## 小日历

小日历继续由内置 `calendar` scene 展示「小日历表」的今天至 6 天后窗口，使用 `.phone-theater-calendar-columns` 左窄右宽分栏：左侧 `.phone-theater-calendar-days` 中的日期按钮显示关系、日期、天气图标及休假提示，右侧 `.phone-theater-calendar-detail` 显示事件标题、天气／状态／节日标签与完整正文。页面只使用表内日期，不引入时分、温度或现实日期；缺失日期的入口禁用，不生成占位事件。选中以 `aria-pressed` 和柔和底色表示，不使用装饰描边。

白天沿用奶油抹茶，夜间使用暖可可与燕麦文字，随小手机全局主题切换。颜色集中在 `00-theme-modes.css` 的 `--yuzi-theater-calendar-bg/card/wash/text/body-text/muted/accent/soft/weather-text/weather-bg/selected/selected-text`；尺寸与间距使用 `00-phone-tokens.css` 的 `--yuzi-theater-calendar-*`，圆角、字体、可读文本缩放与标题栏热区复用公共 token。左右分栏随容器宽度收窄，正文自然换行并使用页面主滚动区，不截断长内容或另建详情滚动框。

| 类名 | 用途 |
| --- | --- |
| `.phone-theater-calendar-page` / `.phone-theater-calendar-header` / `.phone-theater-calendar-columns` | 七日窗口标题与左右分栏骨架 |
| `.phone-theater-calendar-days` / `.phone-theater-calendar-day` | 七日选择；缺失项禁用，选中态以 `aria-pressed` 标记 |
| `.phone-theater-calendar-day-relation` / `.phone-theater-calendar-day-date` / `.phone-theater-calendar-day-meta` / `.phone-theater-calendar-weather-icon` | 日期关系、日期和天气／休假摘要 |
| `.phone-theater-calendar-detail-relation` / `.phone-theater-calendar-event` / `.phone-theater-calendar-content` | 右侧所选日、事件标题和完整正文 |
| `.phone-theater-calendar-badges` / `.phone-theater-calendar-weather` / `.phone-theater-calendar-status` / `.phone-theater-calendar-festival` | 天气、状态与节日标签；放假状态加 `.is-rest` |

右上角编辑复用 `PHONE_ICONS.edit` 与 `.phone-nav-icon-button` 的小铅笔，通过现有表格编辑桥进入原始七日表。日期选择保存在当前场景的 `calendarSelectedDateKey`，数据更新后仍在窗口内的选择继续保留；没有有效选择时优先今天，否则选择首个有效日期。底部挂载复用同一场景，日期选择可用，宿主导航与编辑限制仍由底部容器管理；状态栏与 Home Indicator 由手机外壳统一提供。

## 系统商店

系统商店表的内置页面使用 `.yuzi-theater-shop`，沿用原型的浅色奶油抹茶、深色黑粉、双列货架、任务卡和背包标签。颜色在 `00-phone-tokens.css` 的 `--yuzi-theater-shop-light-*` / `--yuzi-theater-shop-dark-*` 登记，间距、卡片、字号、品级底色浓度使用 `--yuzi-theater-shop-*` 语义 token；圆角复用 `--yuzi-phone-radius-*`，字体与可读缩放跟随手机主设置。

导航复用 `buildBuiltinTheaterNav()`；确认购买、刷新、放弃、背包详情与晋升提示复用 `showConfirmDialog()` / `showAlertDialog()`，不带入原型手机壳、状态栏、独立弹层和测试面板。Home 留白沿用 docked 契约。底部保留现有标题栏、布局与留白，标题栏继续沿用宿主的点击限制；购买、刷新、放弃与背包使用和 App 共用实现。页面内容末尾固定提示“填表过程中不要购买东西哦~亲~”，不监听 AI 填表状态或禁用其间操作。

## 正文对话气泡

正文美化模块列表在既有内置行后追加时间栏与用户模块，使用同一 `.yuzi-body-module`、`.yuzi-body-module-head`、`.yuzi-body-module-content`、`.phone-ios-switch` 和提示词编辑器。有附加提示词的内部开关同正文朗读嵌套展开；纯展示开关只显示一行。模块错误使用 `.phone-ios-group-footer` 和已有危险色 token。分组底部固定「导入模块／导出模块」，没有新模块预览或排序；预览仍只服务气泡。自带时间栏没有删除按钮，用户模块删除复用公共确认框。局部保存不重建页面，导入／删除保留滚动位置和未保存提示词草稿。

正文挂载点 `.yuzi-body-module-view` 复用 `--yuzi-body-spacing`，模块内容使用各自 Shadow DOM；作者样式不渗入气泡或设置页。自带时间栏的 `--yuzi-time-paper/edge/ink/muted/wash/particle/hill/leaf/branch` 属于模板内部局部配色，随本条剧情月份和时间决定四季与昼夜，不新增小手机全局主题开关。样式、Canvas 插画和动画都随 JSON 导出；动态效果由模块的 `motion` 开关控制，后台／离开视口暂停，减少动态偏好停用动画。

入口是设置中的单个二级页；人物管理、美化参数、模块提示词使用原页展开，语气标记在朗读展开区内再次独立展开。标题与右侧启用开关互不代替；关闭模块仍可编辑文案。人物新建／编辑、素材选择与数值精确输入复用 `showSettingsSheet()`；删除人物、导入人物确认复用居中 `showConfirmDialog()`，取消删除返回原编辑草稿。正文默认头像与情绪头像复用 QQ 的 `pickImageFiles()`，保存原始 Blob，不裁剪或压缩；其他上传入口沿用原流程。人物弹层右上角为“保存”，成功后关闭，失败保留草稿；底部只保留已有的删除人物操作。选择、步进器、分段控件继续使用隐藏原生字段和 `bindSettingsGroupedControls()`，没有新的控件皮肤。

| 类名／变量 | 用途 |
| --- | --- |
| `.yuzi-body-settings` / `.yuzi-body-module-*` | 分组列表中的展开容器，消费现有设置页间距、颜色、字体 token |
| `.yuzi-body-segment-row` | 用户位置、头像形状与装饰引号复用公共分段控件；窄屏允许换行，无独立配色或尺寸 token |
| `.yuzi-body-prompt-editor` / `.yuzi-body-prompt-actions` | 共享提示词草稿、恢复默认与显式保存；未保存内容不进入注入预览 |
| `.yuzi-body-dialogue` / `.yuzi-body-avatar` / `.yuzi-body-stack` / `.yuzi-body-bubble` | 正文显示专用节点；不覆盖酒馆其他正文或现有组件的样式 |
| `.yuzi-body-speaker` / `.yuzi-body-emotion` / `--yuzi-body-emotion-color` | 姓名与右侧情绪标签共同行；标签复用 `.phone-ios-badge` 的字号、圆角与内边距，情绪配色由固定词表提供，窄屏可换行 |
| `--yuzi-body-emotion-ink-mix/fill-mix` | 情绪色与主题正文字色的混合比例 `62%`、底色浓度 `14%`，在 `00-phone-tokens.css` 登记，深浅模式共用 |
| `.yuzi-body-emotion-grid` / `.yuzi-body-emotion-slot` | 情绪头像复用公共网格的默认四列、`.phone-ios-icon-cell` 与自定义圆点；点击头像上传或替换，公共小按钮直接清空并只更新当前格子 |
| `.yuzi-body-dialogue.is-editorial` / `.yuzi-body-quote` | 非气泡排版、名字首字装饰与末尾／成对引号 |
| `.yuzi-body-original` | 双语上方的整句原文；共用对白颜色与字体，字号为正文的 `0.55em`、透明度 `0.65`，可自然换行；气泡与非气泡共用，不做逐字注音 |
| `.yuzi-body-lines` / `.yuzi-body-bubble.is-paired-bilingual` | 双语原文与译文共用内容区；成对引号模式以左右引号包住上下两行，播放按钮留在右侧；气泡与末尾引号保持原排版 |
| `.yuzi-body-play` | 对白尾部播放、暂停与合成状态；手动合成及预生成复用圆圈加载态，只有点击才播放 |
| `.yuzi-body-voice-controls` / `.yuzi-body-reroll` | 播放与重roll共用的行内按钮组；不拆行，沿用播放键尺寸、强调色与焦点轮廓；重roll仅在开关开启且当前朗读版本已有缓存时显示，生成期间禁用 |
| `--yuzi-body-default-bubble/text/name` | 默认对白配色，在 `00-theme-modes.css` 登记深浅模式 |
| `--yuzi-body-preview-background` / `--yuzi-body-avatar-background/foreground` | 预览底色与首字占位头像配色，同样跟随全局主题 |
| `--yuzi-body-font-size/name-size/line-height/width/spacing/avatar-size/avatar-radius/radius/padding-inline/quote-size` | 由已归一化的用户参数写入正文节点，局部生效 |
| `--yuzi-body-name-color/text-color/bubble-color/quote-color` | 用户显式颜色覆盖；空值继续使用主题默认值 |

正文和设置页样例共用 `createDialogueView()`；QQ 头像框校准与气泡装饰复用 `decorateQQAvatar()`、`decorateQQBubble()`。同一渲染楼层共用素材读取和 Blob URL，楼层销毁统一释放；迟到的图片读取不会重新创建 URL。独立样例拥有并清理自己的资源，不调用 TTS、不写聊天，设置页不建立自己的状态栏。图片资料面板按接近可见区申请图片，最多四个并发读取；关闭面板释放临时 Blob URL。

气泡样式开启时，「气泡圆角」下方显示「气泡左右内边距」，复用既有步进器、长按、数值弹层与保存逻辑；配置 `paddingInline` 为 0–48px、步长 1px、默认 12px，左右各使用该值。默认气泡与人物图片气泡共用 `--yuzi-body-padding-inline`，上下内边距沿用原值；非气泡排版保持零内边距。调节只走已有 `updateStyle()` 和预览帧合并，不重建气泡、不重复提取正文或插入占位节点。

“头像与姓名”展开区中的“情绪”默认关闭，复用嵌套展开、公共 switch 和提示词编辑器；头像模块关闭时停用情绪注入与展示，保留配置。固定标签为开心、生气、难过、紧张、平静、害羞、嫌弃、心动，提示词仅要求从列表选择一个适合当前对白的标签。格式为 `「姓名|情绪|对白」`，双语只在第二行译文增加情绪，语速／表现力仍在末尾；历史两段及数字参数格式继续可读，情绪不送入朗读文本。关闭情绪隐藏标签并使用默认头像，已有正文仍正确解析。缺失／未知情绪隐藏标签；已知情绪缺图或图片读取失败回退默认头像，再回退姓名首字。

人物编辑保留“默认头像”入口，只在情绪开关开启时显示“情绪头像”入口。四列八格面板不自动分配情绪图片，点头像直接选原图，返回保留草稿，统一由人物右上角“保存”提交；清空单格直接修改草稿，不弹确认、不重建面板，不影响默认头像；关闭情绪不删除图片。人物配置包携带 `emotionAvatars`，旧包缺少该字段时按空配置导入；同样按角色卡隔离并复用原有整批导入事务。

默认注入内容按“语言／姓名说明 → 情绪说明与词表 → 格式示例”拼接；双语中的情绪说明放在“按以下两行成对输出”之后、“格式”之前。普通对白采用同样顺序；用户手改的提示词原文保留，独立情绪说明只调整拼接位置。实际注入预览与世界书继续共用 `composeBodyDialoguePrompt()`。

人物编辑与精确数值弹层通过 `className: 'phone-settings-page'` 接入既有输入框主题隔离。普通参数保存局部更新控件和样例，人物列表加载不重建页面；字号、颜色、位置、头像形状与装饰引号更新已有正文节点，不重新读取图片或打断朗读。长按实时预览、结束提交，纯外观调整不触发世界书同步、正文扫描或语音任务组装。公共弹层关闭时即时注销页面清理回调；确认框与提示条在退出动画结束、被替换或离页时释放自身计时器、事件与父页面注册。

双语模式位于头像与姓名、正文朗读之间，默认关闭，复用模块展开、公共 switch、提示词草稿及恢复默认／保存。朗读展开区的“朗读双语”默认关闭，双语关闭时沿用公共禁用态；开启只读上方原文。双语配对只增加一层原文小字，共用同一人物装饰和尾部播放按钮；分别保留原文、译文与换行的恢复位置，只临时隐藏已消费的空原生容器，关闭后恢复，不改聊天数据。纯朗读来源切换不重建正文节点。

“语音预生成”位于正文朗读展开区的“朗读双语”上方，默认关闭，复用 `.phone-ios-row`、公共 switch 与 `.phone-ios-group-footer`，不新增弹层、进度条或 CSS。开启后只为最新已完成且已美化的楼层按阅读顺序后台生成，已有缓存直接跳过；仅当前处理的 `.yuzi-body-play` 显示既有圆圈并设置 `aria-busy`，完成或失败后恢复播放图标。点击圆圈共用该请求并在完成后播放，其余预生成不出声；失败写入现有日志。关闭开关取消后台任务，已被用户点击接管的请求继续；缓存仍由原有窗口清理。设置页样例不参与预生成。

“重roll”位于“语音预生成”与“朗读双语”之间，默认关闭，复用公共行、switch 与说明文字。气泡和引号展示共用同一按钮组；首次手动生成或预生成成功后显示旋转按钮，恢复已有缓存也可显示，切换原文／译文或语速／表现力后按当前版本重新判断。点击停止当前正文播放，复用当前音色、文本、参数与合成入口，成功覆盖该条缓存并自动播放，失败保留旧缓存及现有提示／日志；不清除其他语言版本。生成期间旋转按钮禁用，播放键仍可接管已有请求。关闭重roll只隐藏按钮，不重建正文、不打断已发起的请求、不改世界书；设置页样例没有语音缓存，不显示旋转按钮，也不调用 TTS。

朗读展开区在“语气标记”之后依次增加“语速与表现力”“标点表达”，默认均关闭，沿用同一 `disclosure()`、公共 switch 与提示词编辑器，不新增 CSS 或页面。模块仅在正文朗读启用时参与注入；关闭仍保留草稿。语速与表现力采用 `「姓名|对白|语速,表现力」`，双语参数只追加在第二行姓名／译文末尾；原文与译文共用一组参数，数字不显示、不送入 TTS 文本。开关只影响参数应用及提示词，不重建已有正文或重新读取图片；切换语速与表现力停止旧朗读，下次点击使用对应缓存。标点表达只追加写作提示，不改写已有台词。旧版未手改的语气提示词自动更新为前中后按语境插入标签的说明；用户手改的内容保留，恢复默认可取新版。

人物编辑的“语言”紧跟音色行，复用 `.phone-ios-row`、`.phone-ios-inline-input` 与既有弹层主题隔离，空值显示“默认”，不使用下拉框。人物语言按卡保存，实际注入预览与世界书共用同一拼接函数：内置双语／姓名默认组合合并为一段，非默认人物语言位于语气标记之前；总开关或双语关闭、或头像与朗读均关闭时不追加人物语言，仍保留人物资料。

人物管理展开区的“导入人物配置”与“导出全部人物配置”沿用 `.phone-ios-row.is-action`。导出直接下载当前角色卡的全部人物，不提供人物选择页；导入确认复用居中 `showConfirmDialog()`，有同名人物时通过可选 `content` 控件插槽放置默认关闭的公共 switch“覆盖同名人物”，确认和取消使用公共弹窗按钮。取消选文件、替换选择和离页均清理临时文件控件与页面注册；切换角色卡立即关闭旧确认框，导入整批成功后只集中刷新一次。

主界面与后续系统 App 的公共视觉变量清单。实现 UI 前先读本文和 [`../styles/phone-base/00-phone-tokens.css`](../styles/phone-base/00-phone-tokens.css)；Figma 只提供视觉参考，业务数据、路由和交互仍沿用现有模块。

视觉来源：Figma `02_设计画板` 的 `主界面`（`195:3524`），内屏基准为 `402 x 874`。

## 使用规则

1. 颜色、尺寸、间距、圆角、字体、阴影、透明度和动效值必须使用已有 `--yuzi-*` token；组件 CSS 和 HTML 模板不得新增散写视觉常量。
2. 先复用含义相同的公共 token；确实缺少时，在 [`00-phone-tokens.css`](../styles/phone-base/00-phone-tokens.css) 新增语义化 token，并同步更新本文。
3. 应用 ID、名称、图标、角标数字、路由和动作属于运行时数据，不得写成 CSS token 或 Figma 示例数据。
4. 用户设置应解析为运行时 CSS 变量；不得在组件中直接读取持久化对象或写入颜色值。
5. 只使用项目内登记的本地资源；不得提交 Figma 临时资源 URL、截图或生成的 React/Tailwind。
6. 小手机组件不得直接消费 SillyTavern 的 `--SmartTheme*`、`--ui-color-*` 或宿主页面颜色；宿主主题隔离只能回落到本文登记的小手机语义 token。
7. 所有**扩展自有** CSS 自定义属性必须以 `--yuzi-` 开头；按职责使用 `--yuzi-phone-*`、`--yuzi-theme-*`、`--yuzi-settings-*`、`--yuzi-variable-manager-*`、`--yuzi-theater-*`、`--yuzi-table-review-*` 或 `--yuzi-generic-template-*`，不得新增 `--phone-*`、`--vm-*`、`--tur-*`、`--calendar-*` 等通用前缀。
8. 通用表的正式运行时变量是 `--yuzi-generic-template-*` 与 `--yuzi-generic-template-resolved-*`。旧模板中的 `--gt*`、`--_gt-*` 和旧 style token key 会在进入运行时前兼容迁移；它们只属于历史输入，不得在新增样式、内置模板或文档示例中使用。

## 通用列表操作与 QQ 公共弹层

通用表格列表的新增入口使用 `.phone-entry-fab.phone-list-fab`，右上角 `.phone-generic-manage-menu` 通过公共 `showSettingsActionSheet()` 提供锁定管理和批量删除；管理态隐藏新增入口，标题栏显示 `.phone-generic-manage-done`，删除态继续显示全选、清空和删除数量。既有 `structureOptions.bottomBar.showAdd/showLock/showDelete` 和隐藏操作区设置继续控制入口。

详情页使用同一浮动按钮 `.phone-entry-fab.phone-detail-fab` 进入编辑，整行锁定时禁用；编辑态隐藏铅笔，左侧保留返回，右侧 `.phone-nav-inline-actions.phone-generic-detail-edit-actions` 并排放取消「×」／保存「✓」。图标由 `PHONE_ICONS.editCancel/editSave` 提供，沿用底部可视化的 SVG 路径与手机导航热区；保存使用当前模板的强调色浅底。保存成功退出编辑、失败保留草稿，保存中禁用返回、取消和保存。字段锁定放在右上角公共操作菜单，锁定管理态显示完成。

详情页正文与列表页一样延伸至屏幕底部，安全留白放在滚动内容内部，不在外层容器保留截断正文的固定色带。底部上一条／下一条保留原模板和点击逻辑，通过绝对定位保持原视觉位置：底部偏移仍为 Home 热区高度＋浮动按钮间距，并沿用原翻页栏位移。详情页不声明整条底栏，浮动按钮和翻页均不占用正文布局高度。

浮动按钮尺寸只使用 `--yuzi-phone-list-fab-size`（52px）、`--yuzi-phone-list-fab-inset`（18px）、`--yuzi-phone-list-fab-icon-size`（22px）和 `--yuzi-phone-list-fab-z-index`（12）；颜色消费当前模板的 accent / accent-contrast，阴影复用 `--yuzi-phone-shadow-soft`。按钮与列表末尾留白共用 Home Indicator 热区高度 token，不声明 `data-phone-bottom-bar`，避免把浮动按钮识别为整条底栏。

QQ 的 `showDialog()` 保留原有焦点、关闭、处理中禁用和资源清理逻辑，居中弹窗复用 `.phone-confirm-dialog-*`，输入复用 `.phone-ios-field`；创建群聊与陪聊人物选择使用居中 `.yuzi-qq-person-picker-dialog`，表情录入继续使用 `.phone-ios-sheet`。`.yuzi-qq-settings-layer` 统一把公共组件颜色映射到 QQ 深浅主题；几何消费 `--yuzi-settings-alert-*` 与 `--yuzi-settings-sheet-*`。图片查看保留原有专用布局。

人物选择行使用 `.phone-ios-row`：左侧 `.yuzi-qq-picker-avatar`，姓名 `.yuzi-qq-person-picker-name` 紧邻头像并左对齐；群聊多选在最右侧显示 `.yuzi-qq-picker-check`，隐藏原生复选框外观，保留标签点击、键盘与 checked 状态。头像尺寸 `--yuzi-qq-picker-avatar-size` 为 36px，圆圈 `--yuzi-qq-picker-check-size` 为 22px；选中显示主题色圆底与白色勾。陪聊仍点人物直接进入，不增加确认步骤。两处共用头像渲染与缓存，各弹窗单独持有资源会话，关闭时释放，迟到结果不写入已关闭弹窗。

QQ 居中／内容弹窗和公共确认框通过 `getPhoneOverlayMountRoot()` 挂在完整 `.phone-page` 上，让遮罩覆盖外壳延伸的 Home 背景；Home 横条仍由外壳持有。QQ 事件委托随弹窗提升到 App 根节点，并在销毁时注销，主题作用域保持在原 QQ 根内。手机外调用保留原容器；设置底部面板继续使用已有手机临时层。

QQ 消息、联系人和图片包锚定菜单共用透明菜单行；菜单高度随条目数增长，每行最小高度复用公共按钮的 44px token，图标定宽使用 `--yuzi-qq-dialog-menu-icon-size`（20px），外围间距使用 `--yuzi-qq-inline-gap`。旧 `--yuzi-qq-dialog-menu-height` 仅保留兼容声明，不再固定菜单高度。指针打开时聚焦菜单容器，键盘方向键或 Tab 可进入条目，以柔和背景显示焦点。

所有聊天入口均保留上一页，等目标聊天内容及背景图片加载、解码完成后一起切入；背景继续使用独立的有界媒体租约缓存。失效图片回退当前主题，过期渲染不写入页面；这属于宿主渲染时序，不新增作者生命周期或图片格式。

## 基础与外壳

| 类别 | token | 值 |
| --- | --- | --- |
| 外壳 | `--yuzi-phone-bg-shell` | `#121212` |
| 主界面底色 | `--yuzi-phone-bg-app` | `#000000` |
| 外壳 | `--yuzi-phone-shell-radius` / `--yuzi-phone-shadow-shell-drop` | `55px` / `0 20px 50px rgba(0, 0, 0, 0.6)` |
| 外壳基准尺寸 | `--yuzi-phone-frame-reference-width` / `--yuzi-phone-frame-reference-height` | `418px` / `890px` |
| 内屏基准尺寸 | `--yuzi-phone-screen-reference-width` / `--yuzi-phone-screen-reference-height` | `402px` / `874px` |
| 外壳结构 | `--yuzi-phone-frame-border-width` / `--yuzi-phone-frame-screen-inset` / `--yuzi-phone-screen-radius` | `6px` / `8px` / `47px` |
| 旧版外壳环 | `--yuzi-phone-bg-shell-bezel-inner` / `--yuzi-phone-bg-shell-bezel-outer` | `#3a3a3a` / `#1a1a1a` |
| 旧版外壳环厚度 | `--yuzi-phone-shell-bezel-inner-width` / `--yuzi-phone-shell-bezel-outer-width` | `4px` / `8px` |
| 灵动岛 | `--yuzi-phone-dynamic-island-width` / `--yuzi-phone-dynamic-island-height` / `--yuzi-phone-dynamic-island-radius` | `78px` / `24px` / pill |
| 状态栏 | `--yuzi-phone-status-safe-height` / `--yuzi-phone-status-visual-height` | `62px` / `54px` |
| 状态栏排版 | `--yuzi-phone-status-font-size` / `--yuzi-phone-status-line-height` / `--yuzi-phone-status-font-weight` | `17px` / `22px` / `590` |
| 状态栏间距 | `--yuzi-phone-status-inline-padding` / `--yuzi-phone-status-level-gap` | `24px` / `7px` |
| 全局 App 控件 | `--yuzi-phone-home-indicator-width` / `--yuzi-phone-home-indicator-height` / `--yuzi-phone-home-indicator-hit-height` / `--yuzi-phone-home-indicator-bottom` | `144px` / `5px` / `34px` / `8px` |
| 壳内临时层 | `--yuzi-phone-shell-temporary-layer-z-index` / `--yuzi-phone-home-indicator-z-index` | `20` / `21` |
| 共享裁剪层 | `--yuzi-phone-crop-overlay-padding` / `--yuzi-phone-crop-overlay-hidden-opacity` / `--yuzi-phone-crop-overlay-visible-opacity` / `--yuzi-phone-crop-transition-timing` | `14px` / `0` / `1` / `ease` |
| 裁剪弹窗尺寸 | `--yuzi-phone-crop-dialog-inline-size` / `--yuzi-phone-crop-dialog-compact-inline-size` / `--yuzi-phone-crop-dialog-max-width` / `--yuzi-phone-crop-dialog-max-height` / `--yuzi-phone-crop-dialog-gutter` | `92%` / `95%` / `380px` / `720px` / `28px` |
| 裁剪画布与选框 | `--yuzi-phone-crop-stage-min-height` / `--yuzi-phone-crop-stage-compact-min-height` / `--yuzi-phone-crop-image-max-height` / `--yuzi-phone-crop-box-overlay-shadow` | `260px` / `220px` / `320px` / `0 0 0 9999px 当前 QQ 遮罩` |
| QQ 头像框校准预览 | `--yuzi-qq-frame-calibration-preview-size` / `--yuzi-qq-frame-calibration-stage-size` | `240px` / `62.5%`；内层保留现有校准几何，圆形参考区为外层预览卡片的一半 |
| QQ 头像框参考圈内阴影 | `--yuzi-qq-frame-calibration-guide-shadow` | `inset 0 2px 10px`，颜色为当前 QQ 遮罩的 `60%`；位于图片上方，仅用于预览 |
| 裁剪网格与手柄 | `--yuzi-phone-crop-grid-first-line-position` / `--yuzi-phone-crop-grid-second-line-position` / `--yuzi-phone-crop-handle-size` / `--yuzi-phone-crop-handle-compact-size` / `--yuzi-phone-crop-action-z-index` | `33.333%` / `66.666%` / `14px` / `18px` / `2` |
| 设置首页快捷选择 | `--yuzi-phone-settings-home-quick-select-min-width` / `--yuzi-phone-settings-home-quick-select-max-width` | `84px` / `104px` |
| 应用导航安全顶边距 | `--yuzi-phone-app-nav-top-padding` | `状态栏安全高度` |

裁剪层唯一保留的 CSS 视觉字面量是 `@media (max-width: 520px)` 的查询阈值；CSS 媒体查询不能可靠消费自定义属性，其他裁剪视觉值一律经上表 token 读取。

字体统一使用运行时设置变量 `--yuzi-phone-font-family`；应用文字需同时考虑 `--yuzi-phone-readable-text-scale`。

状态栏的蜂窝、Wi-Fi 和电池图标分别使用项目内的 `assets/phone-status-signal.svg`、`assets/phone-status-wifi.svg` 和 `assets/phone-status-battery.svg`（Figma `195:3510`）；不得改回临时 URL 或手绘替代品。三个白色 SVG 通过 `--yuzi-phone-status-icon-filter` 切换黑白：非首页跟随全局主题，首页跟随 `homeAppLabelColorMode`，并与时间保持同色。

## 全局应用标题栏契约

路由页面通过 `data-yuzi-phone-route` 声明已经提交的目标，准备完成后在同一帧直接替换并释放旧页面，不使用缩放、推屏或淡入／淡出，也不保留转场计时器。首页 App 图标保留原有的缩放淡入，按显示顺序间隔 `40ms` 入场，仅使用 CSS 动画；系统开启减少动态效果时直接显示。按压反馈继续保留。`data-yuzi-phone-bottom-bar="docked"` 只由外壳根据既有 `data-phone-bottom-bar` 自动写到当前页面：页面自身用 padding 保留底部空间，`::after` 使用本页的 `--yuzi-phone-home-region-background` 延续底栏背景；screen 不随目标页面缩短。

Home Indicator 仍由外壳持有唯一可点击按钮，背景透明，与新页面同步显示或隐藏。从首页打开 QQ 时保留首页，等真实首屏数据、初始皮肤样式和带 `data-phone-bottom-bar` 的底栏准备好，再在同一帧切入 QQ 并更新状态栏与 Home Indicator；头像渐进显示，主题失败回退默认样式。首次读取失败保留原页并只提示一次短暂 toast，取消、过期或停用时释放候选页与资源。这些属于宿主页面切换实现，不增加作者包字段、动作或控件。

标题栏的视觉基准来自 Figma `02_设计画板` 的“用户页 / 编辑资料”标题栏（`177:1532`）：内容高度 `54px`，左/右内边距分别为 `10px` / `12px`，方向图标为 `24px`，交互热区为 `32px` 方形。共享实现位于 [`navigation-ui.js`](../modules/phone-core/navigation-ui.js)，页面通过 `buildPhoneNavBar()`、`buildPhoneBackButton()`、`buildPhoneSwitchButton()` 与 `buildPhoneNavTitleSwitcher()` 生成字符串模板；QQ 的 DOM 构建路径使用同一模块的 `createPhoneNavIconElement()` 和相同公共 class。

| 角色 | token | 默认值 |
| --- | --- | --- |
| 状态栏安全区 | `--yuzi-phone-app-nav-top-padding` | `var(--yuzi-phone-status-safe-height)` |
| 标题栏内容高度 | `--yuzi-phone-nav-content-height` | `54px` |
| 左右内边距 | `--yuzi-phone-nav-padding-inline-start` / `--yuzi-phone-nav-padding-inline-end` | `10px` / `12px` |
| 控件热区与图标 | `--yuzi-phone-nav-control-size` / `--yuzi-phone-nav-icon-size` | `32px` / `24px` |
| 左右等宽槽 | `--yuzi-phone-nav-side-slot-width` | `clamp(44px, 15cqi, 60px)` |
| 标题组间距 | `--yuzi-phone-nav-title-gap` / `--yuzi-phone-nav-title-padding-inline` | `4px` / `4px` |
| 标题排版 | `--yuzi-phone-nav-title-font-size` / `--yuzi-phone-nav-title-line-height` / `--yuzi-phone-nav-title-font-weight` | `17px` / `24px` / `500` |
| 控件圆角 | `--yuzi-phone-nav-control-radius` | `var(--yuzi-phone-radius-sm)`；透明底，仅 hover/focus 显示反馈 |
| 前景角色 | `--yuzi-phone-nav-action-color` / `--yuzi-phone-nav-title-color` | 公共强调色 / 公共次级文字色 |
| 表面角色 | `--yuzi-phone-nav-background` / `--yuzi-phone-nav-border-color` | 公共浮层 / 公共弱边框 |
| 交互角色 | `--yuzi-phone-nav-control-hover-background` / `--yuzi-phone-nav-focus-ring-color` / `--yuzi-phone-nav-focus-ring-width` / `--yuzi-phone-nav-disabled-opacity` | 公共 hover 表面 / 公共强调色 / `2px` / `0.38` |
| 第二行操作区 | `--yuzi-phone-nav-secondary-actions-gap` / `--yuzi-phone-nav-secondary-actions-padding-inline` / `--yuzi-phone-nav-secondary-actions-padding-block-end` | `6px` / `10px` / `10px` |
| 第一行行内操作 | `--yuzi-phone-nav-inline-actions-side-slot-width` / `--yuzi-phone-nav-inline-actions-gap` / `--yuzi-phone-nav-inline-action-padding-inline` | `clamp(76px, 27cqi, 108px)` / `clamp(4px, 1.5cqi, 6px)` / `clamp(4px, 2cqi, 8px)` |

结构与维护规则：

1. `.phone-nav-bar` 固定使用 `.phone-nav-leading`、`.phone-nav-center`、`.phone-nav-trailing` 三槽结构；左右槽等宽，中槽为 `minmax(0, 1fr)`。某侧没有动作时仍保留空槽，不能靠绝对定位或不对称 padding 假装标题居中。Theater 编辑/删除等短操作组合使用 `.has-inline-actions` 与 `.phone-nav-inline-actions` 留在第一行 trailing 槽；只有 Generic 批量删除这类确需整行的宽操作才使用 `.has-secondary-actions` 与 `.phone-nav-secondary-actions`。
2. 返回、上一项和下一项都是 icon-only button。按钮内部只放共享 SVG，禁止显示“返回”文字或字符箭头；可访问名称必须通过 `aria-label` 提供。返回图标使用 Figma chevron 路径 `M16 19L8 12L16 5`，不得在页面内复制或替换 glyph。装饰性 `svg` / `img` 必须使用 `pointer-events: none`，由完整的 `32px` button 热区承接点击。
3. `.phone-nav-title-switcher` 按内容宽度紧凑居中，上一项与下一项按钮紧贴标题；其最大宽度不得超过中槽。`.phone-nav-title` 必须保持 `min-width: 0`、`overflow: hidden`、`text-overflow: ellipsis` 与 `white-space: nowrap`；标题过长时只省略文字，不得挤走左右按钮。
4. `.phone-screen` 是名为 `yuzi-phone-screen` 的 inline-size container。标题栏及其页面操作区必须根据手机容器使用 `cqi` 或 `@container yuzi-phone-screen` 响应，禁止用浏览器 viewport 的 `@media (max-width: ...)` 判断手机标题栏宽度。
5. 页面只允许覆写 `--yuzi-phone-nav-background`、`--yuzi-phone-nav-border-color`、`--yuzi-phone-nav-action-color`、`--yuzi-phone-nav-title-color`、`--yuzi-phone-nav-control-hover-background` 等主题角色；不得重新硬编码标题栏高度、三列宽度、图标尺寸、热区、字体、padding 或省略规则。
6. 当前消费者包括 Settings、Generic Table 列表与详情、Theater、小手机变量 App、Fusion、Table Update Review 审核 App、Content Presets 和 QQ 二级页/聊天页。新增 App 也必须从同一共享模块接入，不能新建平行标题栏。

## 原生表单与宿主主题隔离

小手机已提供完整的原生表单语义变量。新 App 的文本输入、数字输入、搜索框、`textarea`、`select` 和 `option` 必须消费这些变量；`checkbox`、`radio`、`range`、`file`、`hidden` 等非文本控件不套用文本表单表面。

| 角色 | token | 用途 |
| --- | --- | --- |
| 表面与正文 | `--yuzi-phone-form-surface` / `--yuzi-phone-form-text` | 输入框、文本域、下拉框和下拉选项 |
| 边框与占位 | `--yuzi-phone-form-border` / `--yuzi-phone-form-placeholder` | 普通边框与 `::placeholder` |
| 禁用态 | `--yuzi-phone-form-disabled-surface` / `--yuzi-phone-form-disabled-text` / `--yuzi-phone-form-disabled-opacity` | 禁用控件的表面、文字和透明度 |
| 焦点 | `--yuzi-phone-form-focus-ring` / `--yuzi-phone-form-focus-ring-width` / `--yuzi-phone-form-focus-ring-offset` | 键盘焦点环 |
| 原生控件主题 | `--yuzi-phone-native-control-color-scheme` | 浏览器原生下拉箭头、滚动条和系统控件的浅深模式 |

SillyTavern 主题可能用 `!important` 强制改写原生控件。此时只允许在小手机外壳隔离层使用同样的 `!important` 取回控制权，并同时设置 `color`、`-webkit-text-fill-color`、`background-color` 和 `border-color`；组件页面仍然只引用上述 token，不复制颜色。`select option` 与 `::placeholder` 必须单独覆盖，否则关闭的下拉框正常、展开后的选项或占位文字仍可能不可读。

变量 App 的 `.vm-page` 将上述表单 token 映射到已有变量页配色，编辑框与添加变量输入框共用外壳隔离，聚焦、失焦、占位与禁用态均跟随小手机主题。聚焦与输入错误只调整边框 token，不另设主题覆盖规则。同楼层刷新保留分组／对象折叠状态，复用稳定滚动锚点优先保持正在编辑的变量位置；读取期间保留原列表，首次进入与切换楼层仍显示加载状态。

使用原生 `checkbox` 的页面必须复用外壳隔离规则：显式恢复 `appearance` / `-webkit-appearance: checkbox`、设置 `color-scheme` 与对应 Yuzi `accent-color`，并保留 `:focus-visible` 焦点环。不要把这条规则施加到已经自绘轨道的开关。

## 底栏与 Home 区域契约

App 页面存在固定底栏时，在底栏根节点声明 `data-phone-bottom-bar`。外壳会自动识别当前活动页中可见的底栏，将 Home Indicator 停靠到其下方，并把底栏计算后的背景复制给独立 Home 区域；没有底栏的页面继续使用悬浮 Home Indicator。App 不得判断自己的路由，也不得硬编码 Home Indicator 留白。

底栏背景必须能够脱离页面内容独立绘制。不要只依赖半透明背景、`backdrop-filter` 或底层渐变，因为这些效果复制到独立 Home 区域后没有相同的背后内容，会显出外壳灰色。需要玻璃感时，底栏仍应提供近乎不透明的最终表面，例如变量 App 使用 `--yuzi-variable-manager-surface-strong`；模糊只作为附加效果。

## 玻璃材质

主屏 Dock 恢复原有玻璃底座尺寸、圆角、留白与材质；窄屏保留自适应收缩。剧情状态卡继续沿用原有网格与材质。二者共用细边框，但透明度和模糊强度不同。

| 部位 | token | 值 |
| --- | --- | --- |
| 共享边框 | `--yuzi-phone-home-glass-border-width` / `--yuzi-phone-home-glass-border-color` | `1px` / `rgba(255, 255, 255, 0.15)` |
| Dock 背景与模糊 | `--yuzi-phone-home-dock-glass-background` / `--yuzi-phone-home-dock-glass-blur` | `rgba(255, 255, 255, 0.2)` / `30px` |
| Dock 阴影 | `--yuzi-phone-shadow-medium` | `0 10px 30px rgba(0, 0, 0, 0.2)` |
| 状态卡背景与模糊 | `--yuzi-phone-home-status-glass-background` / `--yuzi-phone-home-status-glass-blur` / `--yuzi-phone-home-status-glass-saturation` | `rgba(255, 255, 255, 0.08)` / `20px` / `1.6` |
| 状态卡阴影 | `--yuzi-phone-home-status-glass-shadow` | 外部柔影与内高光 |

玻璃始终使用 `backdrop-filter`；不要增加遮罩伪元素或混合模式。需要调整外观时，只改本节 token。

## 主屏

| 类别 | token | 值 |
| --- | --- | --- |
| 网格 | `--yuzi-phone-home-grid-columns` / `--yuzi-phone-home-grid-block-size` | `4` / `642px` |
| 网格间距 | `--yuzi-phone-home-grid-padding-inline` / `--yuzi-phone-home-grid-padding-top` | `26px` / `28.666px` |
| 网格间隙 | `--yuzi-phone-home-grid-column-gap` / `--yuzi-phone-home-grid-row-gap` | `20.667px` / `20px` |
| 首排角标留白 | `--yuzi-phone-home-grid-first-row-badge-clearance` | `6px`（仅剧情状态卡存在时） |
| 默认壁纸 | `--yuzi-phone-home-wallpaper-image` | 项目内 `assets/phone-home-wallpaper-light.jpg`（Figma `195:2718`） |
| 应用槽 | `--yuzi-phone-home-app-slot-width` / `--yuzi-phone-home-app-slot-height` | `80px` / `auto`；随图标和名称撑开 |
| 应用图标 | `--yuzi-phone-home-app-icon-size` / `--yuzi-phone-home-app-icon-radius` | `64px` / `21.875%`；圆角设置仍保存像素值，运行时按设置的图标尺寸换算为百分比 |
| 应用名称 | `--yuzi-phone-home-app-label-gap` / `--yuzi-phone-home-app-label-size` / `--yuzi-phone-home-app-label-weight` | `5px` / `12px` / `510` |
| 深色背景上的应用名称 | `--yuzi-phone-home-app-label-color-on-dark` / `--yuzi-phone-home-app-label-shadow-on-dark` | 白色 / `0 1px 3px rgba(0,0,0,.65)` |
| 浅色背景上的应用名称 | `--yuzi-phone-home-app-label-color-on-light` / `--yuzi-phone-home-app-label-shadow-on-light` | `rgba(20, 24, 28, 0.92)` / `0 1px 3px rgba(255, 255, 255, 0.45)` |
| 当前应用名称 | `--yuzi-phone-home-app-label-color` / `--yuzi-phone-home-app-label-shadow` | 默认指向深色背景组；由白色/黑色外观设置切换 |
| 首页图标入场 | `--yuzi-phone-home-app-enter-duration` / `--yuzi-phone-home-app-enter-easing` / `--yuzi-phone-home-app-enter-start-scale` | `0.3s` / `ease` / `0.7`；duration 同时供 QQ 加载转圈复用 |
| 交互与角标 | `--yuzi-phone-home-app-press-scale` / `--yuzi-phone-home-badge-bg` / `--yuzi-phone-home-badge-fg` | `0.85` / `#ff383c` / 白色 |
| QQ 既有图标 | `--yuzi-phone-home-qq-icon-start` / `--yuzi-phone-home-qq-icon-end` | `#1F9CFF` / `#0069D9` |
| 剧情状态卡布局 | `--yuzi-phone-home-status-offset` / `--yuzi-phone-home-status-inline-padding` / `--yuzi-phone-home-status-gap` | `12px` / 与网格对齐 / `12px` |
| 剧情状态卡 | `--yuzi-phone-home-status-card-min-height` / `--yuzi-phone-home-status-card-padding-block` / `--yuzi-phone-home-status-card-padding-inline` / `--yuzi-phone-home-status-card-radius` | `76px` / `12px` / `14px` / `18px` |

应用网格只消费现有 `buildHomeScreenViewModel()` 数据。Figma 中的示例 App 仅定义槽位外观，不能写入生产列表。QQ 主屏图标保持既有运行时图标来源，允许 `appIcons.__qq__` 覆盖；不得新增 Figma QQ 图标资源。

普通表格、变量、审核、QQ 与小剧场共用 `getTextIcon()` 和 `.phone-dock-text-icon` 底板。文字使用 `--yuzi-phone-home-app-glyph-size`（`44cqi`）与 `--yuzi-phone-home-app-glyph-weight`（`600`）；容器是每个 `.phone-app-icon`，不会再读取 Dock 尺寸。底板使用 `--yuzi-phone-home-app-icon-sheen`、`--yuzi-phone-home-app-icon-inset-shadow`，图标外层共用 `--yuzi-phone-home-app-icon-shadow`，上传图片仍优先。

常规网格铺满手机可用宽度，各列随屏幕横向均匀展开，行高由内容决定。手机内屏不超过 `340px` 时，以内部变量 `--yuzi-phone-home-grid-effective-columns` 切换三列，并按应用槽和间距限宽居中，原列数设置不回写；`--yuzi-phone-home-grid-compact-padding-inline/gap/row-gap` 分别为 `12px/10px/16px`。名称行高消费 `--yuzi-phone-home-app-label-line-height`（`1.35`），窄屏最多 `--yuzi-phone-home-app-label-compact-lines`（`2`）行，仍跟随可读缩放。

外壳以 `yuzi-phone-shell` 容器查询为状态栏预留居中的灵动岛列，正常间隔使用 `--yuzi-phone-status-island-gap`（`8px`）。不超过 `340px` 时使用 `--yuzi-phone-dynamic-island-compact-width`、`--yuzi-phone-status-compact-font-size/icon-height/inline-padding/level-gap/island-gap` 同步收紧岛宽、字体、设备图标和间距；继续使用原有本地状态图标，顶部安全高度不变。两个 `340px` 容器查询阈值是 CSS 条件，不能通过自定义变量配置。

## Dock

| token | 值 |
| --- | --- |
| `--yuzi-phone-home-dock-height` | `140px`；窄屏为 `auto` |
| `--yuzi-phone-home-dock-padding-top` / `--yuzi-phone-home-dock-padding-inline` / `--yuzi-phone-home-dock-padding-bottom` | `20px` / `17px` / `17px` |
| `--yuzi-phone-home-dock-columns` / `--yuzi-phone-home-dock-icon-size` | `4` / `64px` |
| `--yuzi-phone-home-dock-label-display` | `none` |
| `--yuzi-phone-home-dock-material-width` / `--yuzi-phone-home-dock-material-height` / `--yuzi-phone-home-dock-material-radius` | `368px` / `103px` / `38px` |
| `--yuzi-phone-home-dock-material-padding-block` / `--yuzi-phone-home-dock-material-padding-inline` | `19px` / `19px` |
| `--yuzi-phone-home-dock-material-icon-layout` | `space-between` |

Dock 仍消费现有四个运行时入口；隐藏可视标签不等于删除名称或无障碍名称。

默认设置、可视化、数据库、缝合分别使用齿轮、面板、数据库与拼图的本地矢量图形；共用文字图标底板、等比例圆角和同一 SVG 画布，没有素材内嵌背景或重复留白。配色使用 `--yuzi-phone-home-dock-settings/visualizer/database/fusion-start/end`（石墨灰、青绿、蓝、暖橙）。常规底座使用原尺寸与 `space-between` 排列，不随小图标缩窄。窄屏底座高度为 `auto`，宽度受四个图标与内边距总宽限制；`--yuzi-phone-home-dock-compact-padding/gap/radius` 分别为 `10px/8px/24px`。

## 设置分组列表与公共弹层（新功能美化先查这里）

设置二级页统一使用 iOS 分组列表。新功能、新设置页或公共美化类型不要另起样式体系：先复用本节类名与 token；确实缺少时，按「使用规则」第 2 条在 `00-phone-tokens.css`（尺寸）或 `00-theme-modes.css`（颜色）新增语义 token，并把新类型补进下表。

实现位置：骨架与控件 [`07-settings-grouped.css`](../styles/phone-base/07-settings-grouped.css)；弹层与确认框 [`07-settings-layers.css`](../styles/phone-base/07-settings-layers.css)；弹层 JS [`settings-layer.js`](../modules/settings-app/ui/settings-layer.js)；控件桥 [`settings-controls.js`](../modules/settings-app/ui/settings-controls.js)。界面外观页是完整示例。

| 类型 | 类名 | 用途 |
| --- | --- | --- |
| 页面骨架 | `.phone-ios-grouped-page`（加在 body）/ `.phone-ios-group-header` / `.phone-ios-group` / `.phone-ios-group-footer` | 卡片外小标题、圆角卡片、卡片下灰色说明 |
| 滚动分组 | `.phone-ios-group.is-scrollable` | 复用圆角卡片，内容超过 `--yuzi-settings-group-scroll-max-height`（默认 320px）时在卡片内纵向滚动；各分组独立滚动，外层不再嵌套旧列表限高 |
| 行 | `.phone-ios-row` + `.is-tappable` / `.is-action` / `.is-action.is-danger` / `.has-thumb` / `.is-block` / `.is-disabled` | 普通行、可点行（右侧 `.phone-ios-row-value` + `.phone-ios-row-chevron`）、整行操作、红字危险操作、带缩略图行、块状表单行、禁用条目行 |
| 行内元素 | `.phone-ios-row-label` / `.phone-ios-row-title` / `.phone-ios-row-sub` / `.phone-ios-badge`（`.is-muted` / `.is-danger`）/ `.phone-ios-thumb` / `.phone-ios-row-del` / `.phone-ios-row-empty`（`.is-danger`） | 标题、单行省略标题、副标题、状态小标签、缩略图、行尾红字删除、空状态与错误状态 |
| 分组表单 | `.phone-ios-field-label` / `.phone-ios-field` / `.phone-ios-search-row` | 字段说明、分组内文本输入与多行输入、分组标题下的搜索框；复用手机表单主题隔离与聚焦反馈 |
| 字段错误 | `.phone-ios-field[aria-invalid="true"]` | 公共危险色内描边；用 `aria-describedby` 关联对应错误说明，不另配输入框颜色 |
| 行内操作 | `.phone-ios-row-actions` / `.phone-ios-mini-btn`（`.is-danger`）/ `.phone-ios-row-issues` | 状态行右侧紧凑操作按钮、危险操作与可换行的问题列表；读取世界书的 `.phone-worldbook-reading-summary` 支持窄屏换行 |
| 控件 | `.phone-ios-seg` / `.phone-ios-switch` / `.phone-ios-stepper` / `.phone-ios-slider-row` / `.phone-ios-inline-input` / `.phone-ios-details` | 分段控件（2~3 项）、开关、−/+ 步进器、滑块、行内输入、折叠区 |
| 精确数值入口 | `.phone-ios-stepper-value.is-editable` | 使用原生按钮显示数值，点按打开 `showSettingsSheet()` 精确输入；输入范围沿用绑定原生 input 的业务限制 |
| 滑块读数 | `.phone-ios-slider-value` | 滑块旁的定宽数值；消费 `--yuzi-settings-slider-value-width`，拖动时同步更新 |
| 组合块 | `.phone-ios-icon-grid` + `.phone-ios-icon-cell`（`.is-custom` / `.is-match`）/ `.phone-ios-pack-head` / `.phone-ios-font-preview` / `.phone-ios-usage-bar` | 图标网格、资源卡头、预览块、容量条 |
| 悬浮按钮预览 | `.phone-toggle-cover-preview` / `.phone-toggle-preview-shell` / `.phone-toggle-preview-button`（`.is-circle` / `.is-rounded` / `.has-cover`） | 控件与按钮页的实时预览；消费 `--yuzi-settings-toggle-preview-*` 与现有 `--yuzi-phone-toggle-preview-size`，配色跟随公共设置主题 |
| 弹层 | `showSettingsOptionSheet()` / `showSettingsSheet()` / `showSettingsActionSheet()` | 底部单选面板、底部内容面板、底部操作菜单；均挂在手机壳临时层，支持遮罩点击、Esc 关闭与焦点归还 |
| 确认框 | `showConfirmDialog()` / `showAlertDialog()` | 全局居中确认框；危险操作必须二次确认，默认焦点在「取消」 |
| 裁剪框 | `openImageCropDialog()`（`pickImageFile` 调用） | 居中卡片弹窗，画布底色 `--yuzi-phone-crop-stage-background` |

控件桥规则：分组控件只换外观，数据仍走隐藏的原生 `select` / `input`。选择行用 `[data-settings-select="<select id>"]`，分段控件用 `.phone-ios-seg[data-settings-seg="<select id>"]`，步进器用 `.phone-ios-stepper[data-settings-stepper="<input id>"]`；页面调用 `bindSettingsGroupedControls(container, runtime)` 后，既有服务继续按原 id 监听 `change` / `input`。

弹幕设置的普通数值与等长调色板／背景色修改保留当前控件节点，保存归一化后同步数值和色块；增删颜色、调整来源或切换参数面板等结构变化继续复用防回顶重绘。连续修改按顺序保存，旧结果不覆盖较新的页面意图；保存失败恢复已保存配置。正在编辑的 HEX 草稿不会被无关数值保存打断。

步进器可按页在 `.phone-ios-stepper` 上添加 `[data-settings-repeat]` 启用长按：短按仍派发 `input` + `change`；长按 350ms 后每 90ms 调整一次，仅派发 `input` 供局部预览，手势结束统一派发一次 `change` 保存。松手、取消、移出、失焦、切后台或控件销毁均停止，达到上下限不再递增；允许纵向滚动，不在每步重建控件。当前仅正文对话气泡页启用，其余页面维持原行为。

QQ 当前用户与 NPC 编辑资料页共用 `.yuzi-qq-profile-editor-list`，按「形象 / 资料 / 背景」组织 `.phone-ios-group`；文字字段使用 `.phone-ios-inline-input`，字色使用绑定隐藏 `select` 的 `.phone-ios-seg`。资产行使用 `.yuzi-qq-profile-asset-thumb`（`.is-round` 为头像、`.is-tall` 为背景），颜色在编辑页作用域内映射到 QQ token，不改公共控件或资料展示页。头像、资料背景的整行菜单同时提供图片资料选择和原图上传；头像框、气泡复用同一选图面板，有值只显示缩略图，空值保留「未设置」，不新增素材名称字段。分组标题与卡片外边缘对齐，分隔线统一使用公共细线的半高度绘制。

陪聊设置页 `.yuzi-qq-assistant-settings-view` 复用同一分组、字段、字色与资产行，按「人物 / 形象 / 人设」排列，底部操作使用 `.phone-ios-row.is-action`；头像与聊天背景沿用上述图片菜单，人设多行输入使用 `.phone-ios-field`，未保存提示使用 `.phone-ios-badge.is-danger`。页面仅映射公共表单表面、正文与占位 token，继续由外壳隔离层阻断酒馆主题；陪聊人物的头像、头像框、气泡、姓名和字色接全局人物保存接口，聊天背景接当前会话保存接口，人设草稿不自动保存。

私聊／群聊设置页 `.yuzi-qq-conversation-settings-view` 复用上述分组骨架，按「资料 / 世界书」排列；私聊仅提供备注，群聊仅提供群名称，不新增群备注。行内文字使用 `.phone-ios-inline-input`，世界书开关、灯色、深度分别使用公共 switch、seg、stepper，禁用态同步隐藏原生控件与可见按钮，关键词仅在本会话绿灯开启时显示。聊天背景复用同一图片菜单和缩略图，图片资料选择／上传／删除分别接当前私聊或群聊的保存接口。群资料卡与成员管理编辑页复用 `.phone-ios-group`；成员网格使用四列 `.phone-ios-icon-grid`，身份角标使用 `.phone-ios-badge`，管理与退出／解散操作使用 `.phone-ios-row.is-action`（危险动作加 `.is-danger`）。添加成员复用 `showSettingsOptionSheet()`，只列出尚未入群的现有 QQ 好友；成员点击后的资料展示页及所有权限规则不变。

`showSettingsActionSheet()` 与 `showSettingsSheet()` 均支持 `className` 以复用 `.yuzi-qq-settings-layer` 配色；`showSettingsSheet()` 的可选 `onClose` 在完成、遮罩、Esc、替换或销毁时统一执行，用于释放选图资源租约。「完成」只关闭选图面板，实际点选成功后才保存；QQ 图片仍按原图保存，不接裁剪流程。

图片资料页的 `.yuzi-qq-image-library-heading` 横向排列标题与 `.yuzi-qq-image-library-section-actions`，后者只在 `.is-selection-mode` 下显示。全选／取消全选按钮使用 `.yuzi-qq-icon-button.yuzi-qq-image-library-section-action`，复用导航控件热区、QQ 字号与强调色 token；操作仅作用于对应分区，不包含上传入口。删除成功就地移除已删缩略图并退出选择态，不重建未删除的图片节点。

`.yuzi-qq-image-library-grid` 按手机内容区实际宽度自适应：窄屏保留四列并允许缩小，宽屏将列宽固定为 `--yuzi-qq-image-library-grid-item-size`（默认 `72px`），空间足够时自动增加列数；网格整体居中，余量留在左右两侧，不再拉伸缩略图。使用 `auto-fill` 保留空列，素材较少或末行不足时仍与前面的列对齐。六类资源及上传入口共用此规则，间距与内边距沿用现有 token。

`.yuzi-qq-image-library-item` 清除按钮内边距并保持 1:1，图片与 `.yuzi-qq-image-library-sticker` 固定在该方形视口内，原图尺寸不参与网格行高计算；普通图片沿用 `cover`，表情沿用 `contain`。选中描边使用前景伪元素，勾选标记位于其上方，避免铺满图片遮住删除态反馈。

头像框上传的 `.phone-avatar-frame-calibration-overlay` 继续通过公共裁剪临时层居中显示，不使用底部 sheet 或拖动条。`.phone-avatar-frame-calibration-head` 居中放置标题、右侧放单行的「确认上传」文字按钮，字号复用 `--yuzi-settings-alert-message-size`；说明、柔和的方形预览卡片、重置与缩放滑条、居中的取消按钮依次排列。缩放复用 `.phone-ios-slider-row` 与 `.yuzi-qq-settings-range-row` 的原生 range 布局和 QQ 配色，按 `0.001` 的 scale 步长实时更新，重置同步恢复初始位置、大小和滑条值。样式仅作用于 `.phone-avatar-frame-calibration-dialog`，配色沿用 QQ 深浅主题 token；圆形占位位于真实头像框后方，虚线参考圈及其柔和内阴影在上方，不拦截拖动也不写入原图。头像框平移不再要求覆盖头像区域，缩小后仍有宽裕范围；边界以头像与缩放后头像框的半宽之和计算，预览、保存、显示及图片包导入导出共用同一归一化规则，缩放范围、校准数据格式与原图保存逻辑不变。

头像框校准数据以预览内层舞台为基准保存，虚线参考圈为其宽度的 `80%`。共用 `decorateQQAvatar()` 显示有校准数据的素材时，先沿用原归一化规则，再将缩放与两个方向的位移分别除以 `0.8`，换算为真实头像的基准，使列表、聊天、资料和 QQ 通知中的比例与位置和校准预览一致；不回写或迁移原校准数据，不改变图片包格式，没有校准数据的素材保留旧显示方式。

选择面板保留原生 option / optgroup 的禁用状态；步进器保留原生 input 的禁用状态，并在 input / change 后同步数值与边界按钮。分组内容中的 `[hidden]` 始终隐藏，不因公共行布局重新显示；开关默认值只读取已保存配置，不照搬原型示例值。

分组行 `.phone-ios-row` 不消费旧 `.phone-appearance-check-item` 的布局；行内输入 `.phone-ios-inline-input` 与分组字段 `.phone-ios-field`（含多行输入）复用设置页已有的宿主主题隔离规则，正文、占位、光标、聚焦与禁用态跟随手机主题，不复制配色声明。外壳隔离层统一保持行内输入透明、无边框和阴影，避免宿主主题给文本输入额外绘制外框。

选择行的隐藏原生控件放在分组末尾，不插在可见行之间，以保留公共行分割线。需要等待事务提交后才刷新当前值的页面使用 `[data-settings-defer-sync]`；`bindSettingsGroupedControls(container, runtime, canInteract)` 的可选交互闸门沿用页面已有的忙碌与销毁状态，提交中不开新面板，取消或失败不提前显示未保存的选择。

| token 组 | 覆盖内容 |
| --- | --- |
| `--yuzi-theme-group-*` → `--yuzi-settings-group-*` | 分组页底、卡片、分割线、按压底、分段选中底、危险色（白天 / 夜间成对） |
| `--yuzi-settings-row-*` / `--yuzi-settings-seg-*` / `--yuzi-settings-stepper-*` / `--yuzi-settings-switch-*` | 行与控件尺寸、排版 |
| `--yuzi-settings-icon-*` / `--yuzi-settings-thumb-*` / `--yuzi-settings-preview-*` / `--yuzi-settings-usage-*` | 图标网格、缩略图、预览块、容量条 |
| `--yuzi-settings-layer-*` / `--yuzi-settings-sheet-*` / `--yuzi-settings-action-*` / `--yuzi-settings-alert-*` | 遮罩、底部面板、操作菜单、确认框 |


## 已确认边界

底部可视化的删除管理沿用 `.phone-ios-mini-btn`（危险动作加 `.is-danger`）与 `showConfirmDialog()` 的 `.phone-confirm-dialog-*` 公共确认框；`.yuzi-bottom-delete-actions` 只负责工具栏换行，使用导航第二行间距 token。选中态通过 `aria-pressed` 显示，消费公共强调色和焦点描边，不增加一套弹层或配色。

底部切表沿用“准备完成再提交”的页面切换方式：当前内容、标题与导航选中态保持到目标美化完成挂载，再同步替换。准备容器复用 `.yuzi-bottom-content[data-beautified="true"]`，内部 `data-staging="true"` 只负责等尺寸隐藏，并通过 `inert` 与 `aria-hidden` 隔离交互；提交时只移入原有美化根节点，不增加可见包装层、动画或作者适配要求。

- 不实现 Figma 搜索胶囊，也不保留无效占位按钮。
- 剧情时间、天气、日程状态卡保留在应用图标上方，使用本文登记的旧版玻璃材质。
- 主屏删除白色 Home Indicator；它不属于新的全局视觉规范。
- QQ 图标不使用 Figma 资源，保持现有本地来源。
- 当前阶段不做浏览器验证；融合实现完成后由用户手动验证。

## QQ Figma 应用

QQ 前端只消费 `--yuzi-qq-*` 语义变量，不在组件样式中写入颜色、尺寸、间距、圆角、阴影、层级或动效常量。变量按以下职责分组，浅色默认值与 `[data-yuzi-phone-theme="dark"]` 下的深色覆盖一一对应：

| 变量组 | 覆盖内容 |
| --- | --- |
| `--yuzi-qq-light-*` / `--yuzi-qq-dark-*` | 页面、卡片、输入区、弹窗、头像、图标、遮罩与气泡的主题原值 |
| `--yuzi-qq-surface` / `--yuzi-qq-elevated` / `--yuzi-qq-deep-page` / `--yuzi-qq-subtle` / `--yuzi-qq-control` / `--yuzi-qq-input` | 当前全局白天或夜间主题下的层级表面；`deep-page` 用于编辑资料与二级设置的深层页面背景 |
| `--yuzi-qq-text` / `--yuzi-qq-muted` / `--yuzi-qq-icon` / `--yuzi-qq-line` | 正文、次要文字、图标和分隔线 |
| `--yuzi-qq-bubble-self` / `--yuzi-qq-bubble-other` / `--yuzi-qq-danger` | 私聊消息气泡与危险操作状态 |
| `--yuzi-qq-header-*` / `--yuzi-qq-nav-height` / `--yuzi-qq-nav-*` / `--yuzi-qq-page-padding` / `--yuzi-qq-max-content-width` | 四栏根页、二级页和全宽单列响应式布局；`max-content-width` 为兼容别名，最终值为 `100%` |
| `--yuzi-qq-row-*` / `--yuzi-qq-message-*` | 会话、联系人、人物资料和消息行密度 |
| `--yuzi-qq-image-library-grid-*` / `--yuzi-qq-image-library-item-radius` / `--yuzi-qq-image-library-heading-line-height` | 图片资料六类资源的自适应网格（窄屏四列、宽屏固定 `72px` 增列并居中）、格间距、内边距、资源格圆角与分组标题排版 |
| `--yuzi-qq-accent` / `--yuzi-qq-on-accent` | 当前用户头像：品牌蓝底与反色文字，只用于根身份头等“当前用户”身份 |
| `--yuzi-qq-avatar-surface` / `--yuzi-qq-avatar-ink` | 人物占位头像：浅色为 `#f2f3f5 / #cacaca`，用于会话、联系人、聊天对方和人物资料；不得与当前用户头像共用 |
| `--yuzi-qq-composer-*` / `--yuzi-qq-tool-*` / `--yuzi-qq-emoji-*` | 输入区、五类叙事工具、加号装饰入口和底部表情面板 |
| `--yuzi-qq-dialog-surface` / `--yuzi-qq-dialog-*` / `--yuzi-qq-overlay*` / `--yuzi-qq-jump-*` | 统一删除好友、删除会话、添加联系人、工具和跳转气泡 |
| `--yuzi-qq-swipe-*` / `--yuzi-qq-transition` / `--yuzi-qq-disabled-opacity` | 左滑删除、无障碍焦点、低动态和禁用状态 |

QQ 的 `消息 / 联系人 / 助手 / 设置` 是固定根栏；`助手` 保持空白，群聊相关内容不进入当前运行时。QQ 不拥有主题切换入口，主题只由小手机“设置 -> 界面外观”提供。

QQ 响应式与可访问性也只经变量文档约束：`--yuzi-qq-readable-text-scale` 继承 `--yuzi-phone-readable-text-scale`，`--yuzi-qq-reduced-transition` 是低动态下的即时动效 token。`200-400px` 的超窄手机壳保留四栏和输入工具的横向可滚动访问；`800-1200px` 宽屏仍保持全宽单列，不把 QQ 锁在 `402px` 窄栏，也不拉成多列。`超窄`、基准和宽屏均不得靠组件内散写字号、颜色或尺寸补救。


## QQ Figma 02 实测映射（生产权威）

QQ 的视觉权威是 Figma 文件“玉子手机”的 02_设计画板。变量值由节点实测，不从截图、临时 URL 或示例数据取得；状态栏和 Home Indicator 由小手机外壳渲染，QQ 不复制它们。

| Figma 节点 | 实际画面与节点 | 生产 selector | token 组 |
| --- | --- | --- | --- |
| 96:225 | QQ 浅色总区 | .yuzi-qq-app、.yuzi-qq-list-sheet、.yuzi-qq-nav | --yuzi-qq-light-page、--yuzi-qq-light-list-surface、--yuzi-qq-light-tab-surface |
| 233:430 | QQ 深色总区 | [data-yuzi-phone-theme="dark"] 下相同 selector | --yuzi-qq-dark-page、--yuzi-qq-dark-list-surface、--yuzi-qq-dark-tab-surface |
| 195:3310 / 233:466 | 浅深消息根页；头部 195:3402 / 233:558，滚动区 195:3334 / 233:490，Tab 195:3311 / 233:467 | .yuzi-qq-identity-header、.yuzi-qq-list-sheet、.yuzi-qq-nav | --yuzi-qq-root-*、--yuzi-qq-list-*、--yuzi-qq-nav-* |
| 131:2570 / 276:957 | 浅深联系人根页 | .yuzi-qq-contact-list-sheet、.yuzi-qq-contact-utility、.yuzi-qq-contact-row | 连续列表 role token |
| 130:2095 / 233:732 | 浅深私聊；聊天头 130:2096 / 233:735，滚动区 130:2110 / 233:746，输入区 130:2211 / 233:792 | .yuzi-qq-chat-header、.yuzi-qq-message-*、.yuzi-qq-composer | --yuzi-qq-chat-*、--yuzi-qq-composer-*、--yuzi-qq-tool-* |
| 177:1383 / 233:1072 | 浅深人物资料；内容 y226，底部操作栏 y791 | .yuzi-qq-profile-sheet、.yuzi-qq-profile-row、.yuzi-qq-profile-action-bar | --yuzi-qq-profile-* |
| 177:1529 / 233:1118 | 浅深编辑资料 | .yuzi-qq-profile-editor-sheet、.yuzi-qq-field | --yuzi-qq-editor-group-* |
| 177:1804 / 233:1167 | 昵称单字段编辑 | .yuzi-qq-field、.yuzi-qq-dialog-form | 编辑资料与对话框 role token |
| 177:1183 / 233:1201 | 浅深添加菜单 | .yuzi-qq-message-add-menu、.yuzi-qq-message-add-menu-item | --yuzi-qq-dialog-menu-*、--yuzi-qq-dialog-surface |
| 130:2411 / 233:1222 | 浅深新消息跳转气泡 | .yuzi-qq-jump-bubble | --yuzi-qq-jump-* |
| 131:2415 / 233:1226 | 浅深未读跳转 chip | 后续 QQ 未读 chip selector | --yuzi-qq-unread-chip-* |
| 279:4682 / 276:1218 | 浅深设置一级页 | .yuzi-qq-settings-view、.yuzi-qq-settings-sheet、.yuzi-qq-settings-list | --yuzi-qq-settings-root-*、--yuzi-qq-settings-group-* |
| 279:4753、279:4926 / 278:1533、279:5019 | 设置二级页的昼夜外观参考 | 小手机设置外观页；QQ 仅消费主题 | --yuzi-qq-settings-detail-* 与全局 dark 覆盖 |
| 407:641 | 删除好友弹窗参考 | .yuzi-qq-overlay、.yuzi-qq-dialog | --yuzi-qq-dialog-* |
| 407:1786 | 左滑删除参考 | .yuzi-qq-swipe-row、.yuzi-qq-swipe-delete | --yuzi-qq-swipe-* |

Figma 原始底栏顺序不直接复用。生产 QQ 固定为 消息、联系人、助手、设置：使用同一图标加标签的竖排几何，但助手为空白，联系人视觉入口与搜索不执行未定义业务，动态与群聊链路不进入当前运行时。

头像必须按身份角色选 token，而不是按“都是圆形头像”合并规则：当前用户头像使用 `--yuzi-qq-accent / --yuzi-qq-on-accent`；没有真实图片的人物占位头像使用 `--yuzi-qq-avatar-surface / --yuzi-qq-avatar-ink`。真实头像图片覆盖这两组占位色，但不能让按钮的通用 `color: inherit` 重置压过头像文字角色。

### 色板原值

| 角色 | 浅色 role token / 值 | 深色 role token / 值 |
| --- | --- | --- |
| 页面 | --yuzi-qq-light-page: #f2f3f5 | --yuzi-qq-dark-page: #212325 |
| 表面与连续列表 | --yuzi-qq-light-surface: #ffffff；--yuzi-qq-light-list-surface: #ffffff | --yuzi-qq-dark-surface: #212325；--yuzi-qq-dark-list-surface: #1a1c1e |
| Tab | --yuzi-qq-light-tab-surface: #f2f3f5 | --yuzi-qq-dark-tab-surface: #2c2d2e |
| 正文、次要、弱化 | #171a1d / #7a828c / #a8adb4 | #f0f0f4 / #909094 / #5f6061 |
| 图标 | #3b4047 | #c6c6ca |
| 当前用户头像 | 品牌蓝 #0099ff / 白字 | 品牌蓝 #0066cc / 白字 |
| 人物占位头像 | #f2f3f5 / #cacaca | #2c2d2e / #c6c6ca |
| 品牌与在线 | #0099ff / #15d173 | #0066cc / #34c759 |
| 分隔线、搜索 | #e5e5e5 / #f8f8f8 | #3a3c3e / #2c2e2f |
| 聊天头、输入区 | #eeefef / #f8f8f8 | #1a1b1c / #1a1b1c |
| 深层聊天面 | #f2f3f5 | #0f1113 / #242628 / 未读 #3c3e3f |
| 设置页、分组、描边 | #f1f2f6 / #feffff / #e8e7e8 | #000000 / #1c1c1e / #38383b |

### 结构与排版原值

| 结构 | 变量 | 实测值 |
| --- | --- | --- |
| QQ 内屏 | --yuzi-qq-screen-width / --yuzi-qq-screen-height / --yuzi-qq-page-radius | 402px / 874px / 47px |
| 外壳保留区 | --yuzi-qq-status-height；Home Indicator 不在 QQ 内渲染 | 62px；外壳负责 |
| 根身份头 | --yuzi-qq-root-header-height / --yuzi-qq-root-header-padding-inline / --yuzi-qq-root-header-gap | 58px / 16px / 12px |
| 根头像、状态、操作 | --yuzi-qq-root-identity-avatar-size / --yuzi-qq-root-status-dot-size / --yuzi-qq-root-action-size | 38px / 12px / 28px |
| 根标题与状态文本 | --yuzi-qq-root-title-size / --yuzi-qq-root-title-line-height；--yuzi-qq-root-status-size / --yuzi-qq-root-status-line-height | 17/24；11/15，均遵从可读文字比例 |
| Tab | --yuzi-qq-tabbar-height / --yuzi-qq-nav-item-width / --yuzi-qq-tab-content-height / --yuzi-qq-nav-icon-size / --yuzi-qq-nav-item-gap | 83px / 82px / 49px / 26px / 1px |
| 搜索带 | --yuzi-qq-list-search-sheet-height / --yuzi-qq-search-height / --yuzi-qq-search-radius | 60px / 36px / 12px |
| 会话行 | --yuzi-qq-conversation-row-height / --yuzi-qq-conversation-row-padding-inline / --yuzi-qq-conversation-avatar-size / --yuzi-qq-conversation-row-gap | 76px / 16px / 52px / 12px |
| 会话文字 | --yuzi-qq-row-title-size / --yuzi-qq-row-preview-size / --yuzi-qq-caption-size | 16/23 / 13/19 / 11/15 |
| 私聊顶部 | --yuzi-qq-status-height + --yuzi-qq-detail-top-gap + --yuzi-qq-chat-header-height | 62px + 8px + 54px |
| 私聊消息 | --yuzi-qq-chat-avatar-size / --yuzi-qq-message-gap / --yuzi-qq-chat-bubble-max-width / --yuzi-qq-chat-bubble-content-max-width | 40px / 8px / 278px / 254px |
| 气泡 | --yuzi-qq-bubble-padding-block / --yuzi-qq-bubble-padding-inline / --yuzi-qq-bubble-radius | 9px / 12px / 12px |
| 输入区 | --yuzi-qq-composer-height / --yuzi-qq-composer-padding-block-start / --yuzi-qq-composer-padding-inline / --yuzi-qq-composer-input-height | 122px / 8px / 12px / 40px |
| 六工具 | --yuzi-qq-tool-size / --yuzi-qq-tool-icon-size / --yuzi-qq-tool-interval | 24px / 24px / 40px 节距；窄壳横向滚动，不换行 |
| 表情覆盖层 | --yuzi-qq-private-emoji-panel-height / --yuzi-qq-private-emoji-panel-padding-block / --yuzi-qq-private-emoji-column-min | 基准高度 320px；覆盖消息区，不改变输入区与消息流的布局高度；列数由最小轨道自动从五列收缩到四列、三列 |
| 消息多选栏 | --yuzi-qq-message-selection-action-size / --yuzi-qq-message-selection-icon-size / --yuzi-qq-message-selection-injection-padding-inline | 36px / 18px / 12px |
| 跳转气泡 | --yuzi-qq-jump-width / --yuzi-qq-jump-height / --yuzi-qq-jump-icon-size / --yuzi-qq-jump-radius | 114px / 34px / 18px / 左侧胶囊 |
| 人物资料 | --yuzi-qq-profile-sheet-start / --yuzi-qq-profile-sheet-overlap / --yuzi-qq-profile-row-height / --yuzi-qq-profile-avatar-size / --yuzi-qq-profile-hero-avatar-size / --yuzi-qq-profile-avatar-overlap / --yuzi-qq-profile-avatar-initial-size | 226px / 36px / 102px / 68px / 84px / 36px / 30px |
| 人物操作栏 | --yuzi-qq-profile-action-bar-height / --yuzi-qq-profile-action-padding-top / --yuzi-qq-profile-action-padding-inline / --yuzi-qq-profile-action-gap / --yuzi-qq-profile-action-radius | 83px / 4px / 16px / 8px / 8px |
| 编辑资料 | --yuzi-qq-editor-group-radius / --yuzi-qq-editor-group-padding-block / --yuzi-qq-editor-group-padding-inline / --yuzi-qq-form-group-gap | 14px / 13px / 16px / 10px |
| 添加菜单 | --yuzi-qq-dialog-menu-width / --yuzi-qq-dialog-menu-icon-size / --yuzi-qq-dialog-menu-radius | 168px / 20px / 14px；高度随内容增长，行热区复用公共 44px 按钮 |
| 设置一级 | --yuzi-qq-settings-root-group-radius / --yuzi-qq-settings-root-group-padding-* | 27px / 12px 24px 12px 12px |
| 设置二级 | --yuzi-qq-settings-detail-card-radius / --yuzi-qq-settings-detail-card-padding-* | 27px / 24px 12px |

组件 CSS 只可引用当前 role token。Figma 的删除好友与左滑参考图只定义结构和视觉，不作为生产图片嵌入。主题只由小手机 设置 -> 界面外观 改写全局 data-yuzi-phone-theme；QQ 不建立自己的主题开关。

### Figma 02 补充生产映射

`--yuzi-qq-legacy-light-surface` 只是旧版兼容别名，表示 Figma 的页面背景 `#f2f3f5`，不再作为生产内容表面使用。生产内容表面统一使用 `--yuzi-qq-light-surface` 与 `--yuzi-qq-light-content-surface`（浅色 `#ffffff`）；深色对应 `--yuzi-qq-dark-surface` 与 `--yuzi-qq-dark-content-surface`（`#212325`）。连续列表使用 `--yuzi-qq-list-surface`，浮层/输入白面使用 `--yuzi-qq-content-surface`，二者不得回退为页面背景。

聊天工具栏只使用 `--yuzi-qq-tool-size`、`--yuzi-qq-tool-icon-size` 和 `--yuzi-qq-tool-interval`：图标为 `24px`，相邻工具节距为 `40px`。`--yuzi-qq-tool-interval` 只允许由 `.yuzi-qq-tool-bar` 消费；状态、Tab、搜索、表单和气泡分别使用自己的语义间距 token。资料编辑分组固定使用 `--yuzi-qq-editor-group-radius`（`14px`），设置一级分组与设置二级卡片分别使用 `--yuzi-qq-settings-root-group-radius` 和 `--yuzi-qq-settings-detail-card-radius`（均为 `27px`），三者不得互相替换。

| Figma 02 节点 | 成对皮肤/区域 | QQ 生产 selector | 生产 token 组 |
| --- | --- | --- | --- |
| `96:225 / 233:430` | QQ 浅色与深色总区 | `.yuzi-qq-app` | `--yuzi-qq-*-page`、`--yuzi-qq-*-surface`、`--yuzi-qq-*-content-surface` |
| `195:3310 / 233:466` | 消息根页 | `.yuzi-qq-message-root-view`、`.yuzi-qq-message-root-sheet` | `--yuzi-qq-page`、`--yuzi-qq-list-surface` |
| `195:3402 / 233:558` | 消息身份头；浅色当前用户头像 `195:3406` | `.yuzi-qq-identity-header`、`.yuzi-qq-identity-avatar` | `--yuzi-qq-root-*`、`--yuzi-qq-accent`、`--yuzi-qq-on-accent` |
| `195:3334 / 233:490` | 消息滚动区、搜索与浅色会话头像 `195:3342 / 195:3343` | `.yuzi-qq-list-sheet`、`.yuzi-qq-search`、`.yuzi-qq-avatar` | `--yuzi-qq-list-*`、`--yuzi-qq-avatar-surface`、`--yuzi-qq-avatar-ink` |
| `195:3311 / 233:467` | 四栏底部导航 | `.yuzi-qq-nav`、`.yuzi-qq-nav-item` | `--yuzi-qq-nav-*`、`--yuzi-qq-nav-item-gap` |
| `131:2570 / 276:957` | 联系人页 | `.yuzi-qq-contact-root-view`、`.yuzi-qq-contact-root-sheet` | `--yuzi-qq-list-surface`、`--yuzi-qq-conversation-*` |
| `130:2095 / 233:732` | 私聊页 | `.yuzi-qq-private-chat-view` | `--yuzi-qq-chat-*`、`--yuzi-qq-page` |
| `130:2096 / 233:735` | 私聊顶部固定区 | `.yuzi-qq-chat-header` | `--yuzi-qq-chat-header-*`、`--yuzi-qq-chat-top-surface` |
| `130:2110 / 233:746` | 私聊消息流与气泡 | `.yuzi-qq-message-stream`、`.yuzi-qq-message-bubble` | `--yuzi-qq-message-*`、`--yuzi-qq-bubble-*` |
| `130:2211 / 233:792` | 私聊输入区与六工具 | `.yuzi-qq-composer`、`.yuzi-qq-tool-bar` | `--yuzi-qq-composer-*`、`--yuzi-qq-tool-interval` |
| `177:1383 / 233:1072` | 用户页 | `.yuzi-qq-profile-page`、`.yuzi-qq-profile-sheet` | `--yuzi-qq-profile-*`、`--yuzi-qq-list-surface` |
| `177:1529 / 233:1118` | 编辑资料 | `.yuzi-qq-profile-editor-view`、`.yuzi-qq-profile-editor-sheet` | `--yuzi-qq-editor-group-*`、`--yuzi-qq-form-group-gap` |
| `177:1804 / 233:1167` | 昵称字段视觉映射（当前产品未单设昵称路由） | `.yuzi-qq-profile-editor-form`、`.yuzi-qq-field` | `--yuzi-qq-editor-group-*`、`--yuzi-qq-input` |
| `177:1183 / 233:1201` | 添加菜单 | `.yuzi-qq-message-add-menu`、`.yuzi-qq-message-add-menu-item` | 外围 `--yuzi-qq-dialog-surface`；行背景透明；尺寸使用 `--yuzi-qq-dialog-menu-*` |
| `130:2411 / 233:1222` | 跳至最新消息气泡 | `.yuzi-qq-private-chat-jump-bubble`、`.yuzi-qq-jump-bubble` | `--yuzi-qq-jump-*` |
| `131:2415 / 233:1226` | 未读数量 chip | `.yuzi-qq-badge` | `--yuzi-qq-unread`、`--yuzi-qq-badge-padding-inline` |
| `279:4682 / 276:1218` | 设置一级 | `.yuzi-qq-settings-root-view`、`.yuzi-qq-settings-root-sheet` | `--yuzi-qq-settings-root-*` |
| `279:4753 / 278:1533` | 设置外观二级 | `.yuzi-qq-settings-detail-view`、`.yuzi-qq-settings-detail-sheet` | `--yuzi-qq-settings-detail-*` |
| `279:4926 / 279:5019` | 设置选择与上传弹层 | `.yuzi-qq-dialog`、`.yuzi-qq-overlay` | `--yuzi-qq-dialog-*`、`--yuzi-qq-overlay` |
| `407:641 / 407:1786` | 删除好友与左滑删除参考 | `.yuzi-qq-dialog`、`.yuzi-qq-swipe-row` | 仅映射结构和 role token，不作为生产图片嵌入 |

### QQ 可选发送键

设置首页“发送键”开关使用 `--yuzi-qq-send-switch-width`（44px）、`--yuzi-qq-send-switch-height`（26px）、`--yuzi-qq-send-switch-padding`（3px）、`--yuzi-qq-send-switch-thumb`（20px）和 `--yuzi-qq-send-switch-duration`（150ms）。开关未选中消费 `--yuzi-qq-muted`，选中消费 `--yuzi-qq-accent`，滑块消费 `--yuzi-qq-on-accent`；减少动态效果时停用滑动过渡。

输入框的纸飞机与终止键互斥显示，共用 `--yuzi-qq-private-stop-size`、`--yuzi-qq-private-stop-icon-size` 和 `--yuzi-qq-radius-8`，不增加第二个按钮位置。纸飞机使用 `--yuzi-qq-accent`，终止键仍使用 `--yuzi-qq-danger`，禁用状态消费 `--yuzi-qq-disabled-opacity`。

### QQ 语音气泡与主设置 TTS

语音气泡是「播放按钮 + 原文折叠按钮 + 原文」三件套，外层仍使用 `.yuzi-qq-voice-message`（气泡底、圆角、内边距沿用 `.yuzi-qq-message-bubble` 同组声明），最小宽度消费 `--yuzi-qq-private-voice-min-width`，摘要行间距消费 `--yuzi-qq-private-voice-summary-gap`。

| selector | 作用 | 消费 token |
| --- | --- | --- |
| `.yuzi-qq-voice-play` | 整行播放/生成按钮，透明底、继承气泡文字色 | `--yuzi-qq-private-voice-summary-gap`、`--yuzi-qq-disabled-opacity` |
| `.yuzi-qq-voice-spinner` | 首次合成时替代喇叭的转圈，不附加“生成中”文案 | `--yuzi-qq-focus-ring-width`、`--yuzi-qq-radius-full`、`--yuzi-phone-home-app-enter-duration` |
| `.yuzi-qq-voice-transcript-toggle` / `.yuzi-qq-voice-transcript-icon` | 展开原文的箭头入口 | `--yuzi-qq-private-voice-action-gap`、`--yuzi-qq-private-voice-transcript-size`、`--yuzi-qq-muted` |
| `.yuzi-qq-profile-voice-row` | 联系人、陪聊、“我”的角色音色选择行 | 复用 `.phone-ios-row`、值槽和箭头，无独立 token |

展开态挂在气泡外层的 `.is-expanded`（沿用既有 `.yuzi-qq-voice-original` 规则），播放态与生成态分别是 `.is-playing` 与 `.is-loading`。加载转圈复用既有旋转 keyframes，低动态下停止装饰旋转；加载时播放按钮禁用，失败后原条可重试，不另设重试按钮。已知声音标记在普通文字、回退文字和展开原文中隐藏，不渲染标签 chip。

主设置的 TTS 二级页按连接预设、预设编辑、音色仓库、仓库导入导出、试听排列，复用 `buildSettingsPageFrame()`、`.phone-ios-group`、`.phone-ios-field`、`.phone-ios-mini-btn`，不在 QQ 内保留另一套语音设置。预设选择、新建、加载模型、保存与删除复用 API 预设的 `.phone-ios-row.is-action`、选择行与 `showSettingsOptionSheet()`；删除预设使用现有确认框，不另设清除密钥入口。模型列表和预设选择弹层带 `.phone-settings-page`，加载状态复用分组 footer；模型加载与选择仅局部更新已有按钮、状态和列表行，不重建页面、不让整页切换禁用配色，不先清空旧列表。加载失败保留原列表与手写值，成功后更新列表；选择只填入手写模型栏，保存后生效。预设保存、切换和删除直接消费操作返回的预设快照，局部更新现有表单、选择行和状态，不重新查询音色仓库或重建输入框；保存成功清空密钥草稿与输入框，失败保留草稿，结果提示在操作收尾后显示。其他同页重绘统一接 `createScrollPreserver().createRerenderWithScroll()`，仓库操作保留滚动位置；首次进入仍从页顶显示。
仓库列表只显示名称，名称／ID／分类／备注在编辑弹层填写；分类复用 `.phone-ios-seg`。音色编辑弹层带 `.phone-settings-page`，复用设置页已有的输入框主题隔离、聚焦与禁用态，不另配表单颜色。导入导出只包含音色仓库，不携带连接配置、预设或密钥；返回按钮回到设置首页。试听要求先保存预设，只显示短状态，技术错误留给现有日志。
连接区的“前端直连”复用 `.phone-ios-switch`，开关随预设保存，试听读取当前已保存预设；关闭时走酒馆转发。新连接默认关闭，旧配置尊重已保存的选择，不照搬默认值覆盖。

三处人物编辑页的「角色音色」都紧接消息字色，复用 `.phone-ios-row` + `.phone-ios-row-label` + `.phone-ios-row-value` + `.phone-ios-row-chevron`。右侧只显示所选名称或「未配置」，公共 `showSettingsOptionSheet()` 从仓库选择，带 `.yuzi-qq-settings-layer` 复用 QQ 弹层配色，不提供人物页手填入口。仓库编辑和操作走 `showSettingsSheet()` / `showSettingsActionSheet()`，不增加平行弹层或颜色尺寸系统。

联系人资料包自带的音色在同一行显示名字，缺名时显示 ID；选择弹层保留一项标注「随联系人携带」的当前声音，与仓库选项分开识别，即使 ID 相同也不会自动改绑。保持当前项不写入仓库，主动选「未配置」或仓库声音才替换人物配置。联系人包携带的头像框、气泡继续使用原有缩略图、选择和卸下入口，保留图片参数与消息字色，不增加公共素材条目或新样式。
