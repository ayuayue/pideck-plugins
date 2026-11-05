# registry.json 格式与收录标准

`registry.json` 是 PiDeck 插件市场「官方收录」的唯一来源，也是本仓库唯一的索引文件。它由**人**维护（PR 加一条），由 `scripts/validate.mjs` 与每个插件的 `pideck-plugin.json` **交叉核对**：派生字段对不上就报错，`--fix` 可自动回填。

## 顶层

```json
{
	"schemaVersion": 1,
	"plugins": []
}
```

## 一条 RegistryEntry

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 必须等于 `plugins/<id>/pideck-plugin.json` 的 `id`，也必须等于目录名 |
| `name` | ✅ | 派生自 manifest，`--fix` 可回填 |
| `version` | ✅ | 派生自 manifest（仅展示；授权看内容指纹，不看版本） |
| `description` | — | 派生自 manifest。市场卡片上显示，写具体一点 |
| `permissions` | ✅ | 派生自 manifest。市场直接展示，用户不必先下载就知道要什么权限 |
| `icon` | — | 派生自 manifest 的面板 icon（白名单名，如 `bar-chart`） |
| `presentations` | — | 派生自 manifest：所有面板形态去重后的数组（`modal` / `page` / `popover`） |
| `author` | ✅ | 作者或组织名 |
| `license` | ✅ | SPDX 标识（`MIT` / `Apache-2.0` / …），与插件目录的许可一致 |
| `repo` | ✅ | `owner/name`。**源码可以在别的仓库**，不必是本仓库 |
| `ref` | — | 分支 / tag / commit。省略 = 仓库默认分支 |
| `subpath` | — | 插件在仓库里的子目录。省略 = 仓库根 |
| `atomgitRepo` | — | 同一插件在 AtomGit 的镜像仓库 `owner/name`；`ref` / `subpath` 沿用 GitHub 条目。缺省 = 只提供 GitHub 源 |
| `tags` | — | 小写关键词，参与市场搜索（`id` / `name` / `description` 之外的补充） |
| `homepage` | — | 插件主页或源码目录链接；省略时按 `repo`/`ref`/`subpath` 拼 |

`installUrl` 不用写：由 `repo` + `ref` + `subpath` 拼成 PiDeck 能直接吃的 GitHub 链接（`https://github.com/<repo>/tree/<ref>/<subpath>`）。所以 `repo` 必须是 `owner/name`，不要写成完整 URL。

## 收录标准

**必须：**

1. `pideck-plugin.json` 合法（`node scripts/validate.mjs` 通过）；
2. 权限最小化——每一项都能说清「为什么非要不可」；
3. 在 PiDeck 里实际跑过：授权 → 打开面板 → 主要路径可用、console 无报错；
4. 有 `README.md`，说明功能、需要的权限、以及任何联网 / 本地端口的用途；
5. 许可明确（`license` 与仓库里的 LICENSE 一致）。

**会拒：**

- 把会话内容、项目路径或其他本地数据发往 manifest 里没声明的地址；
- 把 API key / token 写进包、写进日志，或提交到仓库；
- 需要 `npm install` / 构建才能跑（PiDeck 不执行仓库里的脚本）——请提交产物，或提供 `.pideck-plugin` 归档；
- 混淆代码、`eval`、动态加载远端脚本；
- 权限明显过度（例如只是存个便签，却声明 `sessions.read.workspace` + `network.https`）。

**收录不等于安全审计**，也不构成任何担保。市场对社区来源会明确标注「未审阅」。

## 校验规则（`scripts/validate.mjs`）

对 `plugins/<id>/`：

- 目录名 == manifest `id`；manifest 通过完整规则校验（`schemaVersion`/`apiVersion` 固定 1、id/name/version 长度、权限白名单与去重、`network.*` 与网络权限严格匹配、`services` 白名单、panels 1–8、commands 0–16、`entry` 必须以 `.html` 结尾且文件存在、icon 白名单、presentation 枚举）；
- 包预算：单文件 ≤4 MiB、整包 ≤16 MiB、≤100 文件、目录深度 ≤8、无符号链接；
- 资源文件名只含 `[A-Za-z0-9_./-]`；
- `README.md` 存在；
- `registry.json` 里有且只有一条同 `id` 的记录，派生字段一致。

对 `templates/<name>/`：同样的结构与 manifest 校验，但**不要求**出现在 `registry.json`（模板不是插件）。

对 `registry.json`：`schemaVersion === 1`、`plugins` 是数组、`id` 不重复且都能在 `plugins/` 下找到目录、`author`/`license`/`repo` 非空、`repo` 匹配 `owner/name`、`ref`/`subpath`/`homepage` 形态合法、派生字段与 manifest 逐字段相等。

加 `--pideck <PiDeck 检出路径>` 时，会额外对每个插件跑一遍 PiDeck 自己的 `scripts/pack-host-plugin.mjs`——那才是包预算与资产路径的权威实现，用来提前发现镜像校验的漂移：

```bash
node scripts/validate.mjs --pideck ../PiDeck
```

## 新增一条（作者视角）

```bash
node scripts/new-plugin.mjs my-panel --template minimal
# 改 plugins/my-panel/pideck-plugin.json 与代码
# 在 registry.json 的 plugins 数组里加一条
node scripts/validate.mjs --fix   # 回填 name/version/description/permissions/icon/presentations
node scripts/validate.mjs         # 全绿后提 PR
```
