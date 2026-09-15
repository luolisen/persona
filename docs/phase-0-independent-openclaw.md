# Phase 0：独立 OpenClaw 环境执行说明

日期：2026-09-16

## 目标

为照影准备一个独立、未登录的 OpenClaw 实例。配置、状态、账号会话、工作区、插件、日志、端口和进程均以项目内显式路径为边界；缺少项目运行时时必须失败，绝不回退到默认 `~/.openclaw` 或既有 Gateway。

本阶段不保留 Gateway 进程。验证时允许一次受控的前台冒烟：启动本项目实例、探测 loopback 健康端点、只终止该测试创建的 PID，并确认端口已释放。这不是常驻服务，也不改变后续切片的登录与消息授权边界。

## 本切片会做什么

1. 固定并记录本机参考包版本，提供项目专用安装入口；安装目标是被 Git 忽略的 `.openclaw/runtime/`。
2. 提供安全默认值的配置模板、目录初始化脚本和只允许窄命令集的包装器。
3. 以物理路径、`lstat`、`realpath` 和 `O_NOFOLLOW` 检查配置、运行时和写入目标；拒绝文件或父目录 symlink，拒绝运行时 CLI 逃逸。
4. 以全新临时夹具进行行为测试，验证 Bash 3.2 首次初始化、环境变量清洗、命令行覆盖拒绝、插件/工作区约束和 Node 引擎边界。
5. 在已安装本项目运行时的条件下，提供一次自清理的 `gateway run` 前台健康验证；不调用服务安装、登录或消息命令。

## 明确不做

- 不读取、复制或修改默认实例的配置、凭据、会话、插件或工作区。
- 不注册 LaunchAgent、守护进程或开机服务；不扫码、不发微信、不调用模型。
- 不实现 Character Runtime、Memory、World 或正式模型 Adapter。
- 不启用微信账号或默认 Agent 自动回复。微信连接与桥接必须在后续、单独审查的切片中实施。

## 验收入口

```bash
./scripts/openclaw-bootstrap.sh
./scripts/openclaw-isolation-check.sh --skip-runtime
./scripts/openclaw-install.sh
npm test
./scripts/openclaw-gateway-smoke.sh
```

最后一条只用于明确授权的本机验证。它只访问 `127.0.0.1:19889/healthz`，并会在退出路径中关闭自己启动的前台 PID；不能替代微信、模型或真实对话验收。

## 回滚

确认没有前台 Gateway 后，删除项目根目录下被忽略的 `.openclaw/`，即可清除本切片创建的专用运行时、状态、日志与未登录会话。版本化脚本、模板和测试保留在 Git 中供审计。
