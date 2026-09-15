# 验证登记

所有记录包含日期、来源/版本、命令、脱敏请求响应、错误与结论。不保存密钥、二维码登录凭据或私人聊天。

| 项目 | 状态 | 当前证据 |
|---|---|---|
| 本机 OpenClaw | 已只读检查 | package.json: 2026.7.1-2；仅作为参考，未作为照影实例使用 |
| Node | 已检查 | v24.19.0，满足上述已安装包声明的 Node 范围 |
| Python | 已检查 | 3.14.7；尚未做项目依赖兼容性测试 |
| 独立实例 | 待开发验证 | 必须独立配置、状态、插件、工作区、日志与端口 |
| 微信能力 | 待实测 | 本机 docs/channels/wechat.md 描述腾讯外部插件，不代表本机已安装或真实可用 |
| 模型 API | 待实测 | Agnes、DeepSeek 均未确认接入参数与账户 |
| OpenViking | Design Assumption | Memory 阶段前验证 |
| License | 待核验 | 不将原始设计中的许可证声明作为已确认结论 |

2026-09-16：`gh api repos/Tencent/openclaw-weixin` 返回 `proxyconnect tcp: dial tcp 127.0.0.1:7897: connect: operation not permitted`。后续权限请求被用户中断，没有上游核验成功证据。

本机参考文件：`/opt/homebrew/lib/node_modules/openclaw/docs/channels/wechat.md`、`docs/gateway/multiple-gateways.md`、`docs/cli/config.md`。包内文档是本机版本证据，不能代替接入当日上游与请求实测。
