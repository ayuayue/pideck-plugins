# 模板：minimal（最小可运行）

不需要任何权限的最小骨架：读 `context`、读写插件自己的 `storage`、订阅事件。

- 形态：`popover`（侧栏那一行旁边就地展开，约 320×280，只适合状态行 + 几个控件）
- 权限：无
- 文件：`pideck-plugin.json` / `app.html` / `app.js` / `styles.css`

## 用法

```bash
node scripts/new-plugin.mjs my-plugin --template minimal --name "我的插件"
```

或直接复制本目录，改 `pideck-plugin.json` 的 `id` / `name` / `version`，并把剩下的 `{{name}}` 占位换成真名（`id` 决定安装目录名，改完目录也要跟着改）。

## 接下来改哪里

- `app.js` 顶部的 `COPY`：中英两份文案，按 `context.locale` 选。
- 想存更复杂的数据：`pideck.storage.set(key, value)` 的 `value` 必须是 JSON 可序列化的；容量 1 MiB / 200 键。
- 想加权限：改 `pideck-plugin.json` 的 `permissions`，然后**重新扫描 + 重新授权**。

参考：官方开发指南第 3 节（最小插件）与第 5 节（`window.pideck` API 全表）。
