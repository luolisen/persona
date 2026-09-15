# 受控微信监控 overlay

此目录不包含上游插件或运行数据。它记录 P0-BRIDGE-01 对
`@tencent-weixin/openclaw-weixin@2.4.6` 的最小受控 fork 方案：只向
`src/monitor/monitor.ts` 的每条入站循环插入一次
`processP0WeixinInbound({ accountId, full })` 调用，并在该调用后无条件
`continue`。

因此原始 `configManager.getForUser(...)` 和 `processOneMessage(...)` 不会运行，
默认路由、session 写入、模型和发送流程均不可达。

overlay 入口由项目的 `src/p0-bridge/p0-weixin-inbound-bridge.mjs` 提供；实际受控
fork 中该文件应位于 `src/monitor/p0-weixin-inbound-bridge.js`。未配置 bridge 或
bridge 抛错时入口仍返回 `handled: true`，保持失败关闭。

来源：Tencent 的 `@tencent-weixin/openclaw-weixin@2.4.6`，许可证 MIT。部署前必须
用 `scripts/check-p0-weixin-inbound-seam.mjs` 对候选源码重新验证版本、SHA-256 和
插入位置。这个仓库没有安装、加载或修改该插件。
