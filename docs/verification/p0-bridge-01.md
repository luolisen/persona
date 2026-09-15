# P0-BRIDGE-01 本地验证

日期：2026-09-16。

## 范围

本记录覆盖版本锁定的微信 monitor overlay 与项目内 Runtime receipt 边界。所有输入均为
Node 测试构造的消息对象；没有启动 Gateway、登录微信、读取账号配置/凭据/会话、发送消息或调用模型。

## 来源核验

只读检查了已安装源码中的下列内容：

- `@tencent-weixin/openclaw-weixin@2.4.6`，许可证文件为 MIT。
- `openclaw@2026.7.1-2`。
- `src/monitor/monitor.ts` SHA-256：
  `4cf6c899fe9f467698c83f2fd098399fb5c07a4f5e9c2e301cd6ba9f7c78ac54`。
- `src/messaging/process-message.ts` SHA-256：
  `c128393c09f49c16cf14da83cbaf4cb5f345f6c98ac819517d4b1c73d6d8eaba`。

`scripts/check-p0-weixin-inbound-seam.mjs` 验证 monitor 的插入点在原生
`processOneMessage(full, ...)` 调用之前；overlay 在调用 bridge 后无条件 `continue`。
下游锁定文件中包含默认路由、session、typing、发送和 `dispatchReplyFromConfig`，因此它们都位于
被截断调用之后。

## 命令与结果

```text
P0_WEIXIN_PLUGIN_ROOT=<only-source-plugin-root> \
P0_OPENCLAW_ROOT=<only-source-host-root> npm test
```

结果：20/20 通过，无跳过、无失败。

```text
node scripts/check-p0-weixin-inbound-seam.mjs \
  --plugin-root <only-source-plugin-root> \
  --openclaw-root <only-source-host-root>
```

结果：`status: ok`；插件和 Host 版本匹配，两个哈希匹配，bridge 调用和 `continue` 均排在原生
`processOneMessage` 前。

## 行为覆盖

- 已批准文本写入项目 `.openclaw/bridge/receipts.ndjson` 的本地测试目录。
- 未知联系人、bridge 缺失/异常、版本不匹配、重复消息、媒体输入均返回 `handled: true`。
- 重复键由账号与消息标识共同计算；同消息标识在不同账号下独立接收。
- 媒体只保存类型元数据；`context_token` 和媒体 URL 不会写入 receipt。
- receipt 写入失败不会登记幂等键，同一消息可在恢复后重试。
- `.openclaw` 父目录或 receipt 文件是符号链接时，Runtime 拒绝写入；初始化失败不会永久缓存，修正本地路径后同一 receiver 可以重试。
- 测试从锁定版本的真实 `monitor.ts` 生成受控 loop 并执行合成消息：经 fork entry 和版本锁 bridge 写入 Runtime receipt，原始 `processOneMessage` 零调用；Runtime 抛错分支同样零调用。

这是合成源码兼容与行为验证，不是微信账号或真实通道验收。后续若要准备或加载受控 fork，必须重新验证候选源码并获得单独授权。
