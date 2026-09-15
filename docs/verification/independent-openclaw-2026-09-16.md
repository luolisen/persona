# 独立 OpenClaw 环境验证记录

日期：2026-09-16。范围：照影 Phase 0 的项目内环境准备与一次有界前台 Gateway 健康验证。没有扫码、账号配置、微信收发、模型调用、Memory/World 或正式 Adapter 实现。

## 版本与当前配置证据

| 项目 | 结果 | 实际证据 |
| --- | --- | --- |
| Node | `v24.19.0` | 通过本项目 Node 引擎检查；支持范围为 `>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0` |
| 项目专用 OpenClaw | `2026.7.1-2` | `./scripts/openclaw-persona.sh --version` 输出 `OpenClaw 2026.7.1-2 (0790d9f)` |
| 微信插件 | 本项目状态目录内安装的 `@tencent-weixin/openclaw-weixin@2.4.6` | 仅做版本锁定源码阅读；未配置 Channel 账号 |
| Gateway 认证 | 已生成、未输出 | 项目 token 文件权限由检查器验证为 `0600`，配置使用 `gateway.auth.mode: "token"` |
| 配置 | 有效 | `./scripts/openclaw-persona.sh config validate` 返回 `Config valid` |

`./scripts/openclaw-isolation-check.sh` 在前台测试前后均通过：配置、状态、工作区、托管插件根、显式插件根和日志路径都位于项目 `.openclaw/`；基础端口为 `19889`，派生浏览器控制端口为 `19891`，`browserEnabled` 为 `false`，且两次端口检查均通过。

## 隔离与回归证据

执行 `npm test` 的结果为 **7/7 通过**。每个测试都使用新的操作系统临时夹具，未读取或修改任何实际默认 OpenClaw 目录。

覆盖的行为包括：

- `/bin/bash`（macOS Bash 3.2 兼容）下的首次 bootstrap，以及继承的 `OPENCLAW_*` 选择器不会写入外部目录。
- 配置文件 symlink 会在 bootstrap、认证写入、配置渲染、安装、CLI 包装器、微信插件安装入口和 Gateway 启动入口之前被拒绝；配置父目录 symlink 也在 bootstrap 前被拒绝；外部 sentinel 文件保持不变。
- 项目运行时 CLI symlink 不可执行，也不能被安装流程沿用。
- 全新 runtime 的首次安装流程通过受控 fake npm 完成，验证安装预检会安全创建项目内目标且不会因缺少 `node_modules/openclaw` 父目录失败；该测试不访问 npm registry。
- 项目 CLI 通过干净环境运行，继承的 `OPENCLAW_*`、`OPENAI_API_KEY`、`PREFIX`、`USERPROFILE` 不会传入；`--profile`、`--dev`、`gateway run --port/--bind`、未审核插件规格和登录命令会被拒绝。
- `plugins.load.paths` 只能是项目插件目录，显式 Agent workspace 被拒绝；Node 下界 `22.22.0`、`24.14.9` 被拒绝，`24.15.0` 与 `26.0.0` 被接受。

另外通过了：`bash -n scripts/*.sh`、各 Node 脚本的 `node --check` 与 `git diff --check`。

## 有界前台 Gateway 验证

实际执行：

```bash
./scripts/openclaw-gateway-smoke.sh
```

结果：通过。该脚本启动的本项目 Gateway 进程在 `127.0.0.1:19889` 的 `/healthz` 返回成功，监听归属被核对为该测试 PID，且不是通配/非 loopback 监听；由于浏览器插件被拒绝，`19891` 没有监听。健康响应、监听检查和 Gateway 日志被写入项目忽略的 `.openclaw/verification/gateway-{health,listener,smoke}.*`。

脚本退出时只向自己创建的 PID 发送 `TERM`；随后再次运行隔离检查，`19889` 与 `19891` 均未被占用。它不调用 `gateway install`、不注册服务、不会留下后台 Gateway，也未调用登录、模型或消息命令。

受限沙箱中的先前尝试因 loopback 解析无法被平台验证而被 OpenClaw 安全拒绝，没有退回到网络绑定；最终结果来自允许本机 loopback 绑定的同一项目有界测试。

## 微信入站审计结论

标准微信插件的源码路径是长轮询 `getUpdates` → `processOneMessage` → Agent 路由与 session 记录 → `dispatchReplyFromConfig` → 微信发送。因此若未来启用标准 Channel 且未在前置位置接管，未命中 binding 的消息会回退默认 Agent；有可用模型时会进入常规模型/回复路径。

`message_sending` 只能作为出站纵深防御，不能阻止此前的路由、session 写入或模型分发，且微信插件在该钩子抛错时会继续发送。后续必须采用前置、失败关闭的桥接层，不能仅靠出站钩子。完整的源码行号、限制与未实现验收计划见 [微信入站桥接计划](../weixin-inbound-bridge-plan.md)。

## 未完成项与回滚

未完成：用户专用微信账号扫码、测试联系人选择、真实入站/出站、模型 API、输入聚合、Character Runtime、Memory、World 和桥接 Adapter。它们均需要新的明确授权与独立验收。

回滚：确认没有前台 Gateway 后，删除本项目 `.openclaw/` 即可移除专用运行时、状态、插件、日志和未登录会话；不影响默认 OpenClaw 或任何全局 npm 包。
