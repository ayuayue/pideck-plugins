# 模板：sessions（会话列表 + 历史预览）

演示只读会话数据的三件事：目录分页、历史条目分页、事件驱动的按需重读。

- 形态：`page`（工作区里的整页，两栏：左列表右历史）
- 权限：`sessions.read` + `workbench.navigate`
- 文件：`pideck-plugin.json` / `app.html` / `app.js` / `styles.css`

## 用法

```bash
node scripts/new-plugin.mjs my-sessions-panel --template sessions --name "我的会话面板"
```

## 关键点

- **分页**：`sessions.list(offset)` 每页 100 条，`nextOffset` 为 `null` 表示到底；历史走 `sessions.entries(sessionId, cursor)` 的 `nextCursor`。不要在循环里把整个目录拉进内存。
- **游标绑文件版本**：`stale-cursor` / `history-changed` 表示文件在你读的期间变了，正确做法是丢掉游标整段重读（`app.js` 里就是这么做的）。
- **`readable: false`**：DSH / ACP / 生图后端不写 JSONL，这类会话没有历史，但**仍然可以 `workbench.navigate`**。
- **事件**：`sessions.changed` 的 `detail.catalogChanged` 才需要重拉列表；带 `detail.sessionId` 的只重读那一个会话。
- **权限**：想去掉「在 PiDeck 中打开」按钮的话，把 `workbench.navigate` 从 `permissions` 里删掉，同时删掉 `app.js` 里的 `#open` 监听。

参考：官方开发指南第 5.2 节（sessions）、第 5.6 节（事件）、第 6 节（安全模型）。
