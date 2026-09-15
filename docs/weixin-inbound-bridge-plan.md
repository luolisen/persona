# 微信入站源码审计与桥接计划（未实现）

日期：2026-09-16。范围仅限本项目已安装的 `@tencent-weixin/openclaw-weixin@2.4.6` 与 `openclaw@2026.7.1-2` 源码阅读。没有扫码、账号配置、网络收发、模型调用或 Adapter 实现。

## 当前的硬边界

- Phase 0 配置没有 `channels` 条目，也没有模型配置；`scripts/check-openclaw-isolation.mjs` 会拒绝任何非空或非对象的 `channels`。
- `scripts/openclaw-persona.sh` 只允许窄命令集，拒绝 `channels login` 和消息相关命令，也只允许固定、审核过的微信插件规格；微信插件安装脚本不执行登录。
- 因此当前实例没有可运行的微信账号。这个结论不依赖读取或展示任何凭据。

## 已确认的入站路径

下列路径均指向项目本地、被忽略的插件或运行时；行号对应本次安装版本。

1. 插件入口将 `openclaw-weixin` 注册为 Channel：`.openclaw/state/npm/projects/tencent-weixin-openclaw-weixin-7783ac86ba/node_modules/@tencent-weixin/openclaw-weixin/index.ts:8-18`。
2. 已配置账号的 monitor 在长轮询中调用 `getUpdates`，逐条调用 `processOneMessage`：`src/monitor/monitor.ts:89-182`。
3. `processOneMessage` 先调用 `channelRuntime.routing.resolveAgentRoute`，随后记录入站 session：`src/messaging/process-message.ts:219-267`。
4. 核心路由在没有匹配 binding 时回退到 `resolveDefaultAgentId`：`.openclaw/runtime/node_modules/openclaw/dist/resolve-route-EO7BJcsf.js:471-482`。
5. 微信插件为回复创建 dispatcher；其 `deliver` 会在没有取消时调用 `sendMessageWeixin`：`src/messaging/process-message.ts:325-419`。随后它调用 `channelRuntime.reply.dispatchReplyFromConfig`：`src/messaging/process-message.ts:449-465`。

因此，若未来把标准微信 Channel 配置为可运行且未在更早处拦截，未命中绑定的入站消息会走默认 Agent 路由；在存在可用模型的情况下，后续是常规模型/回复分发路径。这不是当前 Phase 0 的行为，因为当前既没有 Channel 账号，也没有模型配置。

## 为什么不能只依赖出站钩子

`message_sending` 的 `cancel: true` 在通用 SDK 文档中是终止决定（`.openclaw/runtime/node_modules/openclaw/docs/plugins/sdk-overview.md:472-486`）。但微信插件自己的封装明确写着“钩子错误后继续发送”，并在异常时返回 `cancelled: false`：`src/messaging/outbound-hooks.ts:14-52`。

更重要的是，该钩子发生在 `dispatchReplyFromConfig` 之后。它不能阻止默认 Agent、模型调用或前面的入站 session 写入，也不能作为“桥接故障时零外发”的唯一控制。因此它最多只能作为事后的纵深防御，不能作为默认回复隔离边界。

## 可用的核心拦截面与限制

核心 `reply_dispatch` 钩子在默认模型分发之前运行；返回 `{ handled: true }` 会跳过默认模型分发（`.openclaw/runtime/node_modules/openclaw/dist/dispatch-DnzGTpPs.js:1778-1815`，以及 SDK 语义说明 `docs/plugins/sdk-overview.md:482`）。它可作为版本锁定后的第二道保护。

但它仍在微信插件的路由和 `recordInboundSession` 之后，因此不能单独满足“桥接先接管、再按本地规则归档”的要求。`inbound_claim` 也不能被假定为普通微信消息的通用前置拦截：当前核心代码只在已有 plugin-owned conversation binding 时针对该插件调用它，且缺少处理器或插件会进入回退/通知逻辑（`dispatch-DnzGTpPs.js:1489-1565`）。没有用真实或合成消息验证前，不能把它当作本项目的唯一失败关闭机制。

## 后续最小桥接方案

后续切片应引入一个明确拥有微信入站的本地桥接层（独立插件或受控 fork），并把它置于标准微信插件调用 `resolveAgentRoute`、`recordInboundSession` 与 `dispatchReplyFromConfig` **之前**。它的职责只限于：验证已批准账号/联系人、在项目内本地存储记录、把内容交给后续已授权的 Character Runtime；默认不调用 OpenClaw 的 Agent dispatcher，也不调用微信发送 API。

建议约束如下：

- 没有显式 account/contact 绑定时直接丢弃，不回退默认 Agent；桥接缺失、加载失败或异常时也不发送“错误通知”。
- 所有桥接记录只能落在项目 `.openclaw/` 下的独立本地目录；不注册外部 Memory、World 或远端回退。
- 即使将来启用标准回复链，也保留一个只匹配 `openclaw-weixin` 的 `reply_dispatch` 终止钩子作为冗余保护；它必须返回 handled 且不产生 payload。
- 不把 `message_sending` 当作模型或数据隔离控制；如使用，只能用于额外阻断出站。
- 配置检查器继续拒绝原生 `channels.openclaw-weixin`，直到桥接配置 schema、账户绑定和失败关闭行为被单独审查并写入测试。

## 后续验收（不在本切片执行）

只用本地假消息和注入的 fake dispatcher 做行为测试，不登录：

1. 每条合成微信入站在默认路由之前被桥接层接管；`resolveAgentRoute`、`recordInboundSession` 和 `dispatchReplyFromConfig` 都不得被调用，除非测试明确打开一个已审查的后续模式。
2. 正常、未知联系人、桥接抛错、桥接缺失、重复消息和媒体消息都不得调用 `sendMessageWeixin`、`sendWeixinMediaFile`、`sendWeixinErrorNotice` 或 typing API。
3. 检查 fake 模型调用计数为零，并检查所有允许的归档路径都在项目 `.openclaw/` 下。
4. 对所锁定的 OpenClaw 版本验证 `reply_dispatch` 的 `{ handled: true }` 确实不落入默认模型路径；把该测试视为冗余保护，不替代第一条的前置截断。
5. 只有上述本地测试通过并获得新的明确授权后，才讨论 QR 登录、单一测试账号与真实入站/出站验收。

本文件是桥接设计证据与验收计划，不是微信 Adapter，也不授权任何真实账号操作。
