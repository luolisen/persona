# 冻结决策

日期：2026-09-16。依据：设计补充原文与用户本任务中的直接要求。

1. Phase 0 Channel Acceptance 验证入站、聚合、一次模型调用产生多个消息动作、延时发送、中断、发送失败/未知和睡眠恢复。不得实现长期 Memory 或 World。v0.1 Acceptance 才包含角色、状态、基础履历、PostgreSQL、OpenViking、Weighted Recall、Context Compiler 和主动行为。
2. 每个 Character Instance 只属于一个 User。模板可共享；实例创建后记忆、关系、世界与 Timeline 隔离。Mailbox 以实例为边界。此规则不限定一个用户只能拥有一个实例。
3. 用户纠正只在其自身信息范围内具有最高权威。区分客观事实、User Claim 和 Character Belief；关系事件保留，解释追加修订。
4. 使用 Disclosure Commit 与 Observation Confirmation。LATENT/QUEUED 不冻结；SENT 冻结；OBSERVED 有接触证据；发送未知进入 POSSIBLY_DISCLOSED，禁止生成矛盾事实但不假定用户知情。确认失败时，仅在没有其他披露依赖的情况下解除本次锁定。
5. 外部接口先取得版本、文档与实测证据，再编写正式 Adapter。OpenAI-compatible 不能作为猜测字段的依据。
6. PostgreSQL 保存客观历史、权威状态和证据；OpenViking 服务主观长期记忆。主观偏差不能覆盖客观事实。
7. 照影使用额外建立的独立 OpenClaw 环境：配置、状态、账号会话、工作区、插件目录、日志、端口和进程隔离。禁止修改、重启或借用现有实例的凭据与会话。优先项目专用安装与显式路径；不注册开机服务。
8. 双 Work：主 Work 负责规划、审计、验收、定位与修复闭环；项目内独立开发 Work 使用 GPT-5.6 Terra、Max，执行有界实现与测试，不自行更改架构。每次一个纵向切片。

执行解释：外部依赖验证清单现在建立，OpenViking 的实际接入验证在 Memory 阶段前完成。不得因此扩大 Phase 0。
