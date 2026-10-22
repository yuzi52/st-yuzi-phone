# 构建说明

## 首次设置

1. 安装 Node.js 18+。
2. 在扩展根目录执行：

```cmd
npm install
```

这会安装项目的开发依赖。

## 日常开发

| 命令 | 用途 |
|------|------|
| `npm run build` | 生产构建（minified，发版用） |
| `npm run build:dev` | 一次性开发构建（未压缩，调试用） |
| `npm run build:watch` | 监听模式（未压缩，自动重建） |
| `npm run lint` | 静态代码检查（ESLint） |
| `npm run check` | 运行全部 contract checks，任何失败都会让命令失败 |
| `npm run check:ci` | 运行同一套 contract checks，并在未发现检查脚本时失败，防止空跑成功 |
| `npm run tables:check` | 校验 `tables/sources/` 与 `tables/generated/` 的表源契约和新鲜度 |
| `npm run tables:build` | 从 `tables/sources/` 重新生成 `tables/generated/` 表格模板产物 |

生产构建输出：

- `dist/yuzi-phone.bundle.js`
- `dist/yuzi-phone.bundle.js.map`
- `dist/yuzi-phone.bundle.css`
- `dist/yuzi-phone.bundle.css.map`

日常调试使用 `build:dev` 或 `build:watch`，它们也输出到同一组 `dist/` 文件。`check` 与 `check:ci` 任选其一；发布流程使用一次 `check:ci`。发版前重新执行 `npm run build`，不要提交开发构建产物。

需要隔离构建、不改动正式 `dist/` 时，可指定项目目录之外的输出目录：

```cmd
node build.mjs --outdir <候选目录>
```

`--dev`、`--watch` 可以与 `--outdir` 组合。构建会拒绝项目内部、项目祖先和文件系统根目录，只更新目标目录内的受管构建产物。隔离产物用于验证；正式交付仍执行无 `--outdir` 的 `npm run build`，并提交 `dist/`，不修改 manifest 或 loader 的入口。

玉子美化制作工具是独立发布单元，其安装、检查、测试、打包和回读在该项目自身目录执行，不由小手机构建链代跑。

当前保留脚本版 loader 互斥、`window.__YUZI_PHONE_INSTANCE__` singleton guard、版本字段与 table source 边界检查；对应 contract 入口分别是 `scripts/check-script-loader-contract.cjs`、`scripts/check-extension-version-contract.cjs` 与 `scripts/check-table-sources-contract.cjs`。release/dist 交付由本节发布步骤、CI 的构建产物与提交状态检查，以及发布前人工验收确认。

## 文件结构

- `index.js`：源码 JS 入口。
- `style.css`：源码 CSS 入口。
- `modules/`：业务模块。
- `styles/`：样式分层源码。
- `build.mjs`：esbuild 打包脚本。
- `dist/`：构建产物。
- `scripts/`：contract 静态检查。

## 为什么 `dist/` 必须提交

SillyTavern 的 `auto_update: true` 只会拉取仓库内容，不会自动执行：

```cmd
npm install
npm run build
```

所以 `dist/` 不能加入 `.gitignore`。如果仓库里没有 `dist/`，使用 auto_update 的环境会拿不到实际加载入口。

## 发布新版本

1. 修改 `manifest.json` 的 `version`。
2. 同步修改 `index.js` 文件头 `@version` 和 `EXTENSION_VERSION`。
3. 在 `CHANGELOG.md` 顶部新增对应版本条目（从 `[Unreleased]` 拷贝并加日期）。
4. 若修改了表格模板，先运行 `npm run tables:build` 更新生成产物，再运行 `npm run tables:check` 校验。事实源位于 `tables/sources/` 下的 Markdown 文件，正式表源为 `小剧场2.1` 与 `纪要`；不要手改 `tables/generated/` 或把 `恋爱特化参考` 当作正式表源。
5. 执行一次检查与生产构建：

```cmd
npm run lint
npm run check:ci
npm run build
```

6. 确认 `manifest.json` 的 `js` / `css` 仍指向 `dist/yuzi-phone.bundle.js` 与 `dist/yuzi-phone.bundle.css`，并确认这两个文件由上一步构建生成且非空。
7. 完成浏览器视觉与交互验收。
8. 提交本次源码、文档及正式 `dist/` 变更，按本次版本打 tag 并推送。

## 调试技巧

- 浏览器 Network 标签确认加载的是 `dist/yuzi-phone.bundle.js` 和 `dist/yuzi-phone.bundle.css`。
- 如果 Console 报错，优先看 sourcemap 映射到的源码位置。
- 如果样式异常，先确认 `dist/yuzi-phone.bundle.css` 是否重新生成。
- 如果扩展完全不加载，先检查 `manifest.json` 的 `js` / `css` 路径是否指向存在的文件。
