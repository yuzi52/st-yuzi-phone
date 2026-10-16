# QQ 美化制作流程

QQ 美化是 `manifest.qq` 下的独立能力，不是普通表格 item，也不是弹窗／浮窗／插入正文三种表格 display。纯 QQ 项目可以没有表格。

> 流程合同摘要：先问“要不要美化 QQ 主题或 QQ 通知浮窗”。用户拒绝就不用管，同意才进入对应分支；不强制分别做白天／夜间。人物装饰只在用户明确要做时进入。本轮不建设 QQ 专用模拟器。

## 1. 先确认制作范围

在询问用户要干什么时，同时问两项互相独立的选择：

1. 要不要美化 **QQ 主题应用**？
2. 要不要美化 **QQ 通知浮窗应用**？

用户拒绝的部分不进入制作；已经明确的选择不重复询问。

- QQ 主题可以覆盖 QQ 自己的页面、聊天、设置和 QQ 内部对话框，但不修改小手机外壳、全局状态栏或 Home Indicator，也不改变聊天业务逻辑。
- QQ 通知浮窗只改变现有 QQ 主动消息通知的外观，不另造消息来源、监听、队列或调度。
- 作者可以只改一部分视觉；未覆盖的部分继续使用默认 QQ 样式。

制作主题或通知浮窗时，只顺带问一次是否分别制作白天／夜间两套外观，不强制。只提供 `css` 时，白天与夜间共用同一套；同时提供 `darkCss` 时，才跟随小手机全局主题模式切换。

## 2. 主题资源与人物图库不是一回事

### 主题资源

`manifest.qq.assets` 是主题 CSS 使用的包内图片，例如纹理、花边或页面背景。CSS 用相对路径引用，并用 `--asset` 将文件登记进包。主题资源随这个内容预设存在，不参与人物随机分配。

### 人物图库

`manifest.qq.resources` 会导入 QQ 图片资料图库，支持以下 `library`：

- `avatar-frame`：用户自己或 NPC 的个人头像框；
- `bubble`：个人消息气泡；
- `profile-background`：可选资料背景；
- `chat-background`：可选私聊背景。

群九宫格头像不使用头像框。人物图库素材按内容去重并追加保留；恢复默认主题、切换主题或删除主题预设，不删除图库素材和已经分配的人物装饰。只有用户明确要制作人物装饰时才进入这一段，不要强迫所有用户回答一轮素材问题。

`manifest.qq.outfits` 把素材组成套装。每套必须包含 `avatarFrame` 和 `bubble`，可以附带 `profileBackground`、`chatBackground`。已有个人背景不会被套装覆盖。

NPC 的头像框与气泡只在创建人物时从当时可用的套装或单项素材中随机分配。上传或导入素材不会给已有 NPC 补装；手动卸下或删除素材后保持空位，刷新、重新进入也不自动装回。用户自己的自动分配与资料背景、聊天背景的既有填充规则不变。

气泡资源可声明：

- `padding`：气泡内容内边距，0～128；
- `slice`：九宫格切片宽度，0 表示整图拉伸，正数使用 border-image，0～128；
- `radius`：气泡圆角，0～128；
- `textColor`：十六进制文字颜色，例如 `#4a2540`。

## 3. CSS 边界

CSS 以 `:scope` 表示当前 QQ 根节点或当前通知节点。允许普通平铺选择器、`@media` 和 `@supports`；不要写嵌套选择器规则，也不要加载或执行 JavaScript。

主题 CSS 只能作用在隔离后的 QQ 根节点及其后代，不能选择小手机外壳。

语音主题可美化 `.yuzi-qq-voice-message`、播放按钮、展开原文和 `.yuzi-qq-voice-spinner`，但不要接管合成／播放业务或隐藏操作。加载态为 `.is-loading`，播放态为 `.is-playing`；已知声音标记不生成标签节点。人物「角色音色」复用现有分组行；TTS 连接页在小手机主设置中，不属于 QQ 主题作用域。真实配音仍由真实小手机验收，制作包不发起 TTS 请求。

通知 CSS **不得接管位置、调度、交互、动画或生命周期**。不要设置 `position`、`inset`、`top/right/bottom/left`、`z-index`、`pointer-events`、`animation*` 或 `transform`；这些仍由现有全屏浮层负责。通知外观准备失败时，宿主仍应显示默认通知。

## 4. `project:add-qq` 参数

最小登记：

```powershell
npm run project:add-qq -- --project projects/my-preset/project.json --theme-css qq/theme.css --popup-css qq/popup.css
```

完整参数：

- `--project <project.json>`：源码项目；
- `--theme-css <file>`：QQ 主题基础／白天 CSS；
- `--theme-dark-css <file>`：可选夜间主题 CSS，必须与 `--theme-css` 一起使用；
- `--popup-css <file>`：QQ 通知浮窗基础／白天 CSS；
- `--popup-dark-css <file>`：可选夜间通知 CSS，必须与 `--popup-css` 一起使用；
- `--asset <file>`：主题资源，可重复；
- `--resource '<json>'`：人物图库资源，可重复；
- `--outfit '<json>'`：人物装饰套装，可重复；
- `--replace`：项目已有 `manifest.qq` 时，显式整体替换旧 QQ 声明；
- `--dry-run`：只检查并输出计划，不写文件；
- `--json`：输出机器可读结果。

PowerShell 示例：

```powershell
npm run project:add-qq -- `
  --project projects/qq-sakura/project.json `
  --theme-css qq/theme.css `
  --theme-dark-css qq/theme-dark.css `
  --popup-css qq/popup.css `
  --popup-dark-css qq/popup-dark.css `
  --asset assets/decor.png `
  --resource '{"id":"sakura-frame","library":"avatar-frame","file":"assets/frame.png"}' `
  --resource '{"id":"sakura-bubble","library":"bubble","file":"assets/bubble.png","bubble":{"padding":12,"slice":18,"radius":16,"textColor":"#4a2540"}}' `
  --outfit '{"id":"sakura","avatarFrame":"sakura-frame","bubble":"sakura-bubble"}'
```

也可以只登记人物素材和套装，不绑定空主题或空通知样式。再次登记必须使用 `--replace`，避免无意覆盖整个 QQ 声明。

## 5. `manifest.qq` 示例

```json
{
  "qq": {
    "theme": {
      "css": "qq/theme.css",
      "darkCss": "qq/theme-dark.css"
    },
    "popup": {
      "css": "qq/popup.css"
    },
    "assets": [
      "assets/decor.png"
    ],
    "resources": [
      {
        "id": "sakura-frame",
        "library": "avatar-frame",
        "file": "assets/frame.png"
      },
      {
        "id": "sakura-bubble",
        "library": "bubble",
        "file": "assets/bubble.png",
        "bubble": {
          "padding": 12,
          "slice": 18,
          "radius": 16,
          "textColor": "#4a2540"
        }
      }
    ],
    "outfits": [
      {
        "id": "sakura",
        "avatarFrame": "sakura-frame",
        "bubble": "sakura-bubble"
      }
    ]
  }
}
```

所有 ID 都是稳定 ID；套装引用必须指向本次 `resources` 中分类匹配的资源。完整可构建源码见 `examples/qq-beautify/`。

## 6. 检查与验收

### 正文对话气泡复用素材

正文人物可从 QQ 图片资料选取头像、头像框和气泡，复制图片及必要参数后独立保存。新人物可优先随机选取现有头像框＋气泡套装，已有正文人物不补抽；删除 QQ 源素材或更换 QQ 主题不会修改正文副本。作者继续使用现有 `manifest.qq` 素材声明、示例、校验和回读流程，不需要小手机源码，也不需要新增正文专用包字段。QQ 页面／通知主题 CSS 不应用到正文；首版尚不支持作者导入“提示词＋正文 HTML 模块”，不要在包中编造该入口。纯模拟不执行真实 TTS 或写入角色卡世界书。

正文的双语合并、小字原文以及朗读原文／译文由内置显示层负责，继续复用同一份气泡与头像框素材；作者不需要新增语言字段、翻译动作或双语专用素材，现有示例、校验和纯模拟合同不变。

正文语速／表现力及标点表达由内置朗读模块管理，不改变 `manifest.qq`、素材参数或作者接口；现有示例、校验与纯模拟不新增真实 TTS 调用。

正文“语音预生成”由内置朗读模块按顺序提前准备音频，加载态复用正文播放按钮；不增加作者动作或素材字段，制作包示例、校验与纯模拟继续不调用真实 TTS。

正文人物管理另有面向用户的 JSON 人物配置导入／导出：只携带姓名、语言、独立图片及已有装饰参数、音色 ID 和名字，不携带 TTS 连接或密钥。它不是作者预设格式，不支持 HTML／脚本模块，不扩展 `manifest.qq`；现有作者示例、校验和纯模拟保持不变。

登记后仍走统一流程：

```powershell
npm run project:check -- projects/my-preset/project.json
npm run project:status -- projects/my-preset/project.json --confirm
npm run project:check -- projects/my-preset/project.json --release
node tools/pack-preset.mjs projects/my-preset/project.json output/my-preset.json
node tools/readback-preset.mjs projects/my-preset/project.json output/my-preset.json
```

QQ 分支不建设专用模拟器，也不设置 QQ 模拟确认关卡。自动检查只证明素材、套装、包结构、构建和回读合同通过；CSS 在浏览器中的真实渲染、IndexedDB 素材导入、Blob URL、QQ 页面交互和通知视觉都必须在真实小手机中验收。没有真实宿主证据时，交付记录应写：**真实小手机效果待验收**。
