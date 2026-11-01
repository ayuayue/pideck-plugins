# PiDeck 插件仓库

[PiDeck](https://github.com/ayuayue/PiDeck) 宿主插件的**模板、收录与索引**仓库。三件事：

| 目录 | 内容 |
|---|---|
| `templates/` | 三个可直接运行的最小骨架 + `scripts/new-plugin.mjs` 一条命令生成新插件 |
| `plugins/` | 收录的插件源码（manifest 合法、权限最小、能在 PiDeck 里真跑起来） |
| `registry.json` | 收录索引，PiDeck 插件市场「官方收录」的唯一来源 |

PiDeck 里的**插件市场**（设置 → PiDeck 插件 → 插件市场）同时搜两个来源：

1. **官方收录** —— 本仓库的 `registry.json`，人工核对过 manifest 与权限；
2. **社区 · 未审阅** —— GitHub 上所有打了 [`pideck-plugin`](https://github.com/topics/pideck-plugin) topic 的公开仓库，按星标排序。PiDeck 不为这些来源背书。

搜到就能直接装：市场里的「安装」复用 PiDeck 已有的「从 GitHub 链接安装」链路（`codeload.github.com` 的 tar.gz，不执行仓库里的任何脚本），装完仍是**禁用**状态，必须在插件列表里逐项确认权限后才会启用。

## 快速开始

### 用模板建一个插件

```bash
git clone https://github.com/ayuayue/pideck-plugins
cd pideck-plugins

node scripts/new-plugin.mjs my-panel --template sessions --name "我的面板"
```

生成到 `plugins/my-panel/`。要在 PiDeck 里立刻看到效果：

1. PiDeck → 设置 → PiDeck 插件 → 「打开插件目录」；
2. 把 `plugins/my-panel/` 整个复制进去（**目录名必须等于 manifest 的 `id`**）；
3. 「重新扫描」→「授权并启用」→ 侧栏出现入口。

把 `--out` 指到仓库外，就能给自己独立的插件仓库开工：

```bash
node scripts/new-plugin.mjs my-panel --template network --out ../my-pideck-plugins/my-panel
```

### 三种模板

| 模板 | 权限 | 形态 | 演示什么 |
|---|---|---|---|
| `minimal` | 无 | `popover` | 最小可运行：读 `context`、读写 `storage`、订阅事件 |
| `sessions` | `sessions.read` | `page` | 分页列会话、读活跃分支历史、`workbench.navigate` 跳转 |
| `network` | `network.https` | `modal` | 调 manifest 里声明过的 HTTPS 接口，含加载 / 4xx / 空态 |

模板只声明**真正用到**的权限。加权限就改 `pideck-plugin.json`，然后**重新扫描 + 重新授权**——授权绑定整包逐文件 sha256，改一个字节就失效，这是设计不是 bug。

### 本地校验与打包

```bash
node scripts/validate.mjs        # 校验 plugins/ 与 templates/，并核对 registry.json 一致性
node scripts/validate.mjs --fix  # 用 manifest 回填 registry.json 里的派生字段
node scripts/pack-all.mjs dist   # 全部插件打包成 dist/<id>.pideck-plugin
```

有 PiDeck 的检出的话，再加一道权威复核——它会用 PiDeck 自己的打包脚本重跑一遍每个插件：

```bash
node scripts/validate.mjs --pideck ../PiDeck
```

`validate.mjs` 是 CI 门禁，也是投稿前的自检。它只做**静态**检查（manifest 规则、权限与目的地匹配、包预算、registry 一致），不替代在 PiDeck 里真跑一遍。本仓库的校验是 PiDeck 安装校验的**镜像**（见 `scripts/lib/hostPlugin.mjs` 顶部说明），判定永远以 PiDeck 为准。

### 搜索

```bash
node scripts/search.mjs 会话        # 同时搜 registry.json 与 GitHub topic
node scripts/search.mjs --registry  # 只看官方收录
node scripts/search.mjs --github    # 只看 GitHub 社区
```

网页版（同样逻辑，GitHub Pages）：<https://ayuayue.github.io/pideck-plugins/>

这个 CLI 用 Node 的全局 `fetch`，**不读 `HTTPS_PROXY`**——需要能直连 `api.github.com`。设 `GITHUB_TOKEN` 可以抬高 GitHub API 限额。PiDeck 应用内的市场搜索走 Electron 的 `net.fetch`，会跟随 PiDeck 自己的代理设置，不受这个限制。

## 收录一个插件

插件**不需要**把源码放进本仓库才能被搜到——只要你的仓库打了 `pideck-plugin` topic，市场就能搜到并安装。收录（进 `registry.json`）额外换来：

- 出现在「官方收录」分组，排在社区结果之前；
- 卡片带描述、图标、标签与**权限列表**，用户不必先下载就知道要什么权限；
- 支持**单仓库多插件**（`subpath` 指向子目录）；社区源只认仓库根的那一个。

收录步骤：

1. Fork 本仓库，把插件目录放到 `plugins/<id>/`（目录名 = manifest 的 `id`）；
2. 在 `registry.json` 的 `plugins` 数组里加一条（字段见 [`docs/registry.md`](docs/registry.md)）；
3. `node scripts/validate.mjs --fix && node scripts/validate.mjs` 全绿；
4. 提 PR，说明插件做什么、每一权限为什么非要不可。

收录标准：manifest 合法且权限最小化、没有把本地数据发给未声明的地址、没有把密钥写进包或日志、能在 PiDeck 里实际跑起来。**收录不是安全审计**，也不构成担保。

## 让你的仓库被搜到（社区源）

```bash
gh repo edit --add-topic pideck-plugin
```

社区源的硬要求：

- 仓库**公开**、非 fork、未归档；
- `pideck-plugin.json` 在**仓库根**（一个仓库多个插件请走 registry 收录，社区源只认根目录那一个）；
- 仓库里是**可直接运行的静态文件**——PiDeck 只下载源码包，不跑 `npm install`，也不跑任何构建脚本。需要构建就先提交产物。

## 目录结构

```
templates/<name>/     三个起步模板（每个都是一份可运行的最小插件）
plugins/<id>/         收录的插件，目录名 = manifest.id
schema/               registry.json 的 JSON Schema（给编辑器用；权威校验是 validate.mjs）
scripts/              new-plugin / validate / search / pack-all
scripts/lib/          PiDeck manifest 与包预算的镜像校验
docs/                 authoring.md（怎么写）· registry.md（收录格式与标准）
index.html            搜索页的 Vite 入口（构建后由 Pages 提供）
src/                  搜索页源码：React + Tailwind v4 + shadcn/beUI 组件
registry.json         收录索引（市场官方源）
site/                 搜索页构建产物（npm run build，已忽略）
.github/workflows/    validate（每次推送）· pages（构建并发布搜索页）· release（打 v* tag 时发 .pideck-plugin 附件）
```

网页搜索页要能访问，需在仓库 Settings → Pages 里把 Source 设为 **GitHub Actions**（由 `pages.yml` 构建 `site/` 后发布）。本地预览：

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 构建到 site/
```

## 相关

- 宿主插件开发指南（权威）：[PiDeck/docs/host-plugin-dev-guide.md](https://github.com/ayuayue/PiDeck/blob/main/docs/host-plugin-dev-guide.md)
- 内置参考实现：`plugins/billion-context/`（本地服务启停）、`plugins/session-groups/`（会话读取 + 分组写入）、`plugins/session-stats/`（会话汇总看板）、`plugins/project-notes/`（零权限 + 存储）
- 提问与投稿：本仓库 Issues / Pull Requests

## 许可

模板与脚本：MIT。`plugins/` 下每个插件保留其自身许可（见各目录 README 与 `registry.json` 的 `license`）。
