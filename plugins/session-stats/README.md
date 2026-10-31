# 会话统计

把工作区里的会话汇总成看板：总数、有/无历史文件、按目录 / 模型 / 后端分布、近 14 天活跃度。

- 形态：`page`（工作区内联整页）
- 权限：`sessions.read` + `sessions.read.workspace`
- 图标：`bar-chart`

## 为什么这么写

- **声明 workspace 范围，但界面里再收窄一次**：manifest 里给了 `sessions.read.workspace`，宿主就会把 `context.scope` 设成 `workspace`，`sessions.list` 覆盖整个工作区。「只看当前项目」是插件自己按 `projectId` 过滤——拿到更宽的授权不等于必须用满。
- **采样上限**：分页最多拉 10 页（1000 条），到顶时在副标题里写明「已达采样上限」。统计类插件不该把整个目录拖进内存，也不该静默截断。
- **只读**：全程只用 `sessions.list`，不碰 `sessions.entries`（历史读取是另一档预算），也不写任何文件。

## 想改的话

- 加图表维度：改 `app.js` 里的 `tally()` 调用（比如按 `backend`、按年月）。
- 换采样上限：`MAX_SESSIONS`（注意 `sessions.list` 的 `offset` 硬上限是 100000）。
- 去掉跨项目能力：从 `permissions` 里删掉 `sessions.read.workspace`，并删掉「只看当前项目」开关。
