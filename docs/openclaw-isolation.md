# 照影的独立 OpenClaw 环境

## 运行布局

所有可变数据位于项目根目录的 `.openclaw/`，并被 Git 忽略：

| 内容 | 专用位置 |
| --- | --- |
| OpenClaw 运行时 | `.openclaw/runtime/` |
| 配置 | `.openclaw/config/openclaw.json` |
| 状态、凭据与会话 | `.openclaw/state/` |
| Gateway 本地认证 token | `.openclaw/state/credentials/gateway.token` |
| OpenClaw 托管插件 | `.openclaw/state/extensions/` |
| 显式项目插件加载目录 | `.openclaw/plugins/` |
| 工作区 | `.openclaw/workspace/` |
| 日志 | `.openclaw/logs/` 与 `.openclaw/state/logs/` |
| 隔离的 home 回退根 | `.openclaw/home/` |
| 前台冒烟证据 | `.openclaw/verification/` |

`scripts/openclaw-env.sh` 固定 `OPENCLAW_HOME`、`OPENCLAW_CONFIG_PATH`、`OPENCLAW_STATE_DIR`、`OPENCLAW_PROFILE` 和 `OPENCLAW_GATEWAY_PORT`。所有实际 Node、npm 和 OpenClaw 调用都经由受控的 `env -i` 环境执行：只传入项目路径、受控 `HOME`/XDG/TMPDIR、`PATH` 和这组固定选择器。因此调用者遗留的 `OPENCLAW_*`、模型密钥或用户主目录选择器不会到达项目运行时。

包装器只执行 `.openclaw/runtime/node_modules/openclaw/openclaw.mjs`，不会调用 PATH 中的 `openclaw`。路径帮助器会拒绝配置文件、配置父目录、运行时目录或 CLI 文件的 symlink，并验证物理路径仍在项目根内；写配置时使用 `O_NOFOLLOW`。项目运行时缺失或不安全时安全失败。

配置的 `plugins.load.paths` 必须精确等于项目 `.openclaw/plugins/`；显式 Agent workspace 一律拒绝。这样后续改配置也不能把插件或 Agent 工作区偷偷指向项目外。

OpenClaw 的插件列表把状态目录安装的插件称为 `origin: global`；这里的“global”是 OpenClaw 的实例级术语，不是机器的全局 npm 安装。该安装根由 `OPENCLAW_STATE_DIR` 明确指向本项目 `.openclaw/state/`。

Phase 0 的模板拒绝 `active-memory`、`memory-core` 与 `memory-wiki`，并禁用 elevated tools、`bonjour`、`browser` 和 `canvas`。这避免尚未需要的启动面越过本阶段边界；未来若要启用，必须在新切片中重新审计。

初始化会生成项目内、权限为 `0600` 的 Gateway token，并将同一个值写入被忽略的专用配置；脚本从不输出该 token。

基础端口固定为 `19889`，只绑定 loopback。浏览器控制派生端口是 `19891`；由于 `browser` 被拒绝，它必须保持未监听。检查会拒绝在任一端口已有监听时继续，且不允许临时 `--port`/`--bind` 覆盖。

## 准备与验证

```bash
./scripts/openclaw-bootstrap.sh
./scripts/openclaw-isolation-check.sh --skip-runtime
./scripts/openclaw-install.sh
./scripts/openclaw-persona.sh config validate
npm test
```

`openclaw-install.sh` 固定安装 `openclaw@2026.7.1-2` 到项目 `.openclaw/runtime/`，使用独立 npm 缓存，并禁用 package lifecycle scripts。它不会安装全局包、修改既有 OpenClaw、启动 Gateway 或登录账号。

如需在后续授权切片安装微信插件，可运行：

```bash
./scripts/openclaw-weixin-plugin.sh
```

该脚本固定请求 `npm:@tencent-weixin/openclaw-weixin@2.4.6` 并使用同一隔离状态目录；它不执行 `channels login`。安装插件并不授权扫码、联系人选择或真实消息收发。

## 有界前台 Gateway 验证

`./scripts/openclaw-gateway-smoke.sh` 是唯一的自清理验证入口。它先做完整隔离与端口检查，再以前台 `gateway run` 启动本项目运行时，探测 `http://127.0.0.1:19889/healthz`，确认监听者就是测试子进程且仅为 loopback，确认 `19891` 没有浏览器控制监听，最后仅向它启动的 PID 发送 `TERM`，并复查两个端口都已释放。

该脚本不调用 `gateway install`、不注册 launchd、不留后台进程，也不登录或发送消息。日常启动入口 `./scripts/openclaw-gateway.sh` 同样始终前台运行，但不负责自动停止；仅在独立授权的后续切片中使用。

## 回滚

确认没有前台 Gateway 正在运行后，删除项目内 `.openclaw/` 即可移除本实例的运行时、状态、日志、插件和未登录会话。版本化脚本、模板与测试不会被删除。
