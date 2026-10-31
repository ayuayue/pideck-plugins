# 模板：network（受控网络请求）

演示 `network.https`：在 manifest 里逐个声明允许的 origin，用 `pideck.network.request` 取数据。

- 形态：`modal`（近全屏弹框）
- 权限：`network.https`
- 白名单：`https://api.github.com`（在 `pideck-plugin.json` 的 `network.httpsOrigins`）
- 文件：`pideck-plugin.json` / `app.html` / `app.js` / `styles.css`

## 用法

```bash
node scripts/new-plugin.mjs my-network-panel --template network --name "我的网络面板"
```

## 关键点

- **origin 是逐个写死的**：不能通配符、不能带路径。`https://api.example.com` 和 `https://api.example.com/v1` 不是一回事——后者不是合法 origin，会被拒装。最多 16 个。
- **4xx / 5xx 不抛错**：`pideck.network.request` 只在「请求本身没发出去」时抛错（origin 被拒、DNS 解析到内网、超时、响应超限……）。业务错误看 `response.status` / `response.ok`。
- **响应只有有界 UTF-8 文本**：POST 体 ≤ 256 KiB、响应 ≤ 1 MiB、默认超时 15 秒最多 30 秒；二进制和压缩响应会被拒；不能设 `Cookie` / `Host` / 分帧控制头。
- **面板里没有 `fetch`**：CSP 是 `connect-src 'none'`，只能走 `pideck.network.request`。想加别的域名就改 manifest 再重新授权。
- **别把密钥写进包**：包里的一切都是明文、也会进安装归档。需要用户自己的 token 就放进 `pideck.storage`（每插件独立、1 MiB / 200 键），并在 UI 里让用户自己填。

参考：官方开发指南第 5.5 节（network）、第 6 节（安全模型）。
