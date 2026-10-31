# 写一个 PiDeck 宿主插件

权威文档在 PiDeck 仓库：[`docs/host-plugin-dev-guide.md`](https://github.com/ayuayue/PiDeck/blob/main/docs/host-plugin-dev-guide.md)（官网同页 `/guide/host-plugins`）。manifest 字段全表、`window.pideck` API 全表、错误码、包预算都在那份里。

本文只讲**本仓库**提供的起点和容易踩的坑，不复制那份的内容——两处维护必然漂移。

## 起点

三种，按需要选：

1. `node scripts/new-plugin.mjs <id> --template <name>` —— 推荐。生成目录、填好 manifest、打印下一步。
2. 直接复制 `templates/<name>/`，手动改 `pideck-plugin.json` 的 `id` / `name` / `version`，并把文件里剩下的 `{{name}}` 占位换成真名（面板与命令的 `title` 就是它）。
3. 手写 —— 三个文件就够（`pideck-plugin.json` / `app.html` / `app.js`），见官方指南第 3.3 节。

`id` 决定安装目录名，**全局唯一且生成后不再改**：`^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$`，≤80 字符。想换 id 就是换一个新插件。

模板里的 `name` 与面板/命令 `title` 写成 `{{name}}` 占位：`new-plugin.mjs` 会替成 `--name`，手动复制时自己改。

## 模板对照

| 模板 | 权限 | 形态 | 起点代码 |
|---|---|---|---|
| `minimal` | — | `popover` | `context.get()` 拿项目名与语言、`storage` 存一份 JSON、`onEvent` 订阅 `context.changed` |
| `sessions` | `sessions.read` | `page` | `sessions.list()` 分页列表 + `sessions.entries()` 读活跃分支历史 + `workbench.navigate()` 跳转 |
| `network` | `network.https` | `modal` | `network.request()` 调声明过的 origin，含加载态 / HTTP 4xx-5xx 提示 / 空态 |

模板刻意只声明用到的最小权限。加权限必须同步改 `pideck-plugin.json`，然后**重新扫描 + 重新授权**。

## 开发循环

```
改文件 → PiDeck 设置 → PiDeck 插件 → 「重新扫描」→「授权并启用」→ 打开面板看 console
```

- 面板是普通网页：面板上右键 → 检查，就是该实例的 DevTools。
- **授权绑定整包逐文件 sha256**，改任何文件（哪怕一个空格）都会变成「内容已变更，需重新授权」。
- 启用中的插件不能被替换安装（`plugin-in-use`）：要重装先禁用。
- 白屏 99% 是 `app.js` 抛错：先看 console，再核对 manifest 的 `entry` 指向、文件名有没有空格或中文。

## 容易踩的坑

- **文件名只能用 `[A-Za-z0-9_./-]`**，空格和中文名在 HTML 里引用不到（资产路径会被拒）。
- **没有 `fetch`**。页面 CSP 是 `connect-src 'none'`，联网只能走 `pideck.network.request`，且目的地必须先在 manifest 里声明并授权。
- **`localhost` 不等于 `127.0.0.1`**。本地 HTTP 只允许 `http://127.0.0.1:<声明过的端口>`。
- **不要用 `innerHTML`**。会话标题、接口返回都是数据；一律 `textContent` / `createElement`。
- **会话数据只读，默认只有当前项目**。要跨项目必须同时声明 `sessions.read` 和 `sessions.read.workspace`；范围由宿主写进 `context.scope`，插件自己塞无效。
- **`readable: false` 的会话读不了历史**（DSH / ACP / 生图等），但**可以导航**。别拿 `readable` 当能不能跳转的判断。
- **分页别一次拉全量**：`sessions.list` 每页 100 条、`offset` 上限 100000；`sessions.entries` 单次扫描预算 64 MiB / 10 万条，超了报 `history-too-large`。
- **视觉只消费注入的 CSS 变量**（`--color-*`、`--radius-*`、`--control-height-*`、`--font-size-*`），并且**一定要带缺省值**，否则亮色主题下会看不清。
- **文案按 `context.locale` 出中英两份**。
- **密钥别进包**：`storage` 是本地明文 JSON，不是密钥保险箱；也别写进日志。

## 交给 AI 写

官方指南第 11 节有一份可直接粘贴的约束清单——把它 + 本仓库的模板目录一起给编码助手即可。要点：只用 `window.pideck`、会话只读、权限最小化、不执行接口返回的 HTML/JS、改完提示重新扫描与重新授权。

## 提 PR 前的自测清单

- [ ] `node scripts/validate.mjs` 全绿
- [ ] 在 PiDeck 里真跑过：授权 → 打开面板 → 主要交互可用 → console 无报错
- [ ] 每个权限都问过「不声明会怎样」，能删就删
- [ ] 断网 / 接口 4xx / 空数据三种情况有提示，不是空白页
- [ ] 亮色与暗色主题各看一眼
- [ ] 中英文文案都有
