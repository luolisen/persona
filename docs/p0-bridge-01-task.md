# P0-BRIDGE-01：微信入站桥接纵向切片

## 目标

在 `@tencent-weixin/openclaw-weixin@2.4.6` 的监控循环中，给每条合成入站消息提供一个版本锁定的前置截获点。截获点位于 `processOneMessage` 之前，因此不会进入 OpenClaw 的默认路由、入站 session、模型分发、发送或 typing 流程。

项目本地 Runtime 只接收经批准联系人的文本或媒体元数据。它不调用模型、微信 API、网络服务、Memory 或 World。

## 已锁定的来源与 seam

- Host：`openclaw@2026.7.1-2`。
- Channel：`@tencent-weixin/openclaw-weixin@2.4.6`，MIT。
- 来源文件：插件 `src/monitor/monitor.ts` 的 `for (const full of list)` 循环；其下游 `src/messaging/process-message.ts` 也锁定哈希，用于证明默认路由、session、模型、发送与 typing 均位于被截断调用之后。
- 插入位置：在 `configManager.getForUser(...)` 和 `processOneMessage(full, ...)` 之前。

项目会保存两个来源文件的 SHA-256 与必需锚点。版本、哈希或调用顺序不匹配时，桥接不会启用，并以已处理的失败关闭结果结束该条消息。

## 本切片交付物

1. 版本锁验证器和受控 fork 的最小补丁说明；补丁只改插件监控文件的一个调用点，保留许可证与来源。
2. 本地 Runtime 接收边界：从项目根固定推导 `.openclaw/bridge/`，逐级拒绝符号链接，再记录已接收的合成消息；不保存 `context_token`，也不触发下游 Agent。
3. 受控 monitor seam：无论桥接不可用、版本不匹配、联系人不被允许、重复、媒体或桥接抛错，都不会调用原 `processOneMessage`。
4. 无账号、无网络的测试，包括对实际已安装源码的可选版本锁/插入位置校验。该校验只读取插件与 Host 源码，不读取配置、凭据或会话。

## 验收

| 情形 | Runtime 结果 | 默认路由、模型、外发、typing |
| --- | --- | --- |
| 已批准联系人发送文本 | 本地 receipt 已写入 | 均为零调用 |
| 未知联系人 | 拒绝且不写入 | 均为零调用 |
| bridge 缺失、版本不匹配或抛错 | 失败关闭 | 均为零调用 |
| 重复消息 | 仅保留第一次 receipt | 均为零调用 |
| 同消息标识、不同账号 | 分别接收 | 均为零调用 |
| 媒体消息 | 仅写入媒体元数据，不下载 | 均为零调用 |
| Runtime 持久化失败 | 未登记幂等键，恢复后允许同一消息重试 | 均为零调用 |
| `.openclaw` 或 receipt 是符号链接 | 拒绝写入项目外；同一 receiver 在修正存储后可重试 | 均为零调用 |

## 证明边界

测试会同时验证两件事：项目 adapter 的合成行为，以及锁定版本的真实插件源码生成的 monitor 循环确实经 fork entry 调用版本锁 bridge、写入 Runtime receipt，并在 Runtime 抛错时零次调用原始 `processOneMessage`。它不声称已运行真实微信账号或完整上游网关；真实通道验收仍需要后续单独授权。

## 非目标

不修改 OpenClaw 核心、不修改旧专用实例、不安装或加载微信插件、不登录、不发送真实消息、不建立 Memory、World 或正式 LLM Provider。
