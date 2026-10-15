# 底部可视化删除验证

日期：2026-10-15。

## 环境与范围

- SillyTavern 1.18.0，参考源码提交 `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`。
- shujuku 1.2.9，参考仓库提交 `422e498d46d3c4e306186debd971c99fb84fe767`，SQLite 模式。
- Node.js 24.22.0，Playwright 1.63.0 与其 Chromium 缓存。
- 酒馆程序、配置、用户数据和扩展部署均使用临时测试目录。实写脚本新建专用角色与聊天，使用当前 `dist` 和真实数据库插件，不替换数据库 API，也不调用 AI。

## 自动检查

`node scripts/check-bottom-delete.cjs` 覆盖 SQL／旧 API 删除、倒序索引、锁定、部分失败、排队期间的数据／聊天／生命周期变化，以及数据库已重排锁定位置时不再重复处理。底部可视化、美化挂载、SQL 批量删除、部分失败、作者交接、页面能力与生图宿主回归也已通过；修改模块的 ESLint、语法检查及生产构建通过。

## 浏览器检查

`test-bottom-delete-browser.cjs` 在真实酒馆页面挂载底部运行时和打包 CSS，使用内存数据库 fixture 覆盖选择、全选、清空、取消确认、删除、锁定、倒序、外部更新、切表／关闭清理、原编辑入口、移动端横向布局和空表。此套通过，不作为数据库持久化证明。

`test-bottom-delete-live.cjs` 使用实际安装的完整手机构建与数据库插件：

1. 新建专用测试聊天和表，真实保存 `row_id` 为 `1 / 5 / 9` 的三条记录；SQL 查询与导出数据均读到三条。
2. 刷新并重开聊天，仍读到三条。锁定中间记录，取消删除时三条均保留。
3. 从底部全选并确认删除，只删除 `1 / 9`，保留 `5`；数据库、导出数据和界面一致，锁定位置正确移动到 `0`。
4. 再次刷新并重开，已删记录不复活。
5. 真实外部 SQL 更新使旧删除确认失效。随后从底部删除剩余记录，SQL 与导出视图为空。
6. 删空后刷新并重开，SQL 查询与导出表均为零记录。脚本还兼容空快照尚未物化物理表的情况：只在明确的 `table_not_found` 加目录零用户表时接受空数据库状态，不把任意 SQL 错误当作空结果；本次最终通过的报告使用正常 SQL 读取获得零记录。

两套浏览器脚本均已通过，实写报告包含插入、删除、重开与删空重开的逐步读回记录。

实测发现数据库按稳定行身份保存锁定，删除后索引视图已经更新；手机重复按旧行号调整会清掉保留行的锁。现在传入删除前锁快照，识别已完成的调整，且不覆盖其他并发锁变更。旧 API 和部分失败使用可控 fixture 验证，未声称已对所有数据库模式完成实机矩阵。

## 复现

准备独立酒馆、安装当前手机构建与上述数据库插件后，指定依赖与浏览器路径：

```sh
YUZI_TEST_BASE_URL=http://127.0.0.1:PORT \
YUZI_TEST_PLAYWRIGHT=/path/to/playwright \
YUZI_TEST_BROWSER=/path/to/chromium \
node scripts/test-bottom-delete-browser.cjs

YUZI_TEST_ALLOW_WRITES=1 \
YUZI_TEST_BASE_URL=http://127.0.0.1:PORT \
YUZI_TEST_PLAYWRIGHT=/path/to/playwright \
YUZI_TEST_BROWSER=/path/to/chromium \
node scripts/test-bottom-delete-live.cjs
```

两套按顺序运行。实写脚本保留新建的测试角色／聊天，截图和 JSON 结果写入其打印的系统临时目录。SQL 同步读取接口只在当前聊天运行时就绪后开放，脚本在选中聊天后等待接口发布。
