这 5 个问题都应该在开发前定死，而且里面第 2、3、4 点会直接影响数据库模型，不能留到实现阶段再决定。我的结论如下。

### 1. Phase 0 与 v0.1 验收彻底拆开

截图里的判断是对的。**Phase 0 不应该碰 OpenViking。**

重新定义：

```text
Phase 0 — Channel Spike
目标：证明微信链路和 Reply Program 能成立

只验证：
微信入站
用户连续消息聚合
一次 LLM → 多气泡 Reply Bundle
本地延时发送
新消息中断未发送 Bundle
主动发送真实边界
发送失败/未知
Mac 睡眠/恢复后的过期任务处理

不做：
OpenViking
长期记忆
复杂 Biography
World Simulation
Relationship 演化
```

Phase 0 的成功标准就是：

> **“像人一样收、想一次、分几条发，并且能中断。”**

然后才进入：

```text
v0.1 Vertical Slice
= Channel
+ Persona
+ State
+ 基础 Biography
+ PostgreSQL
+ OpenViking
+ Weighted Recall
+ Context Compiler
+ 主动行为
```

以后文档里不能再使用模糊的“第一阶段”。统一叫 **Phase 0 Channel Acceptance** 和 **v0.1 Acceptance**。

---

## 2. 一个角色实例 = 一个用户的一段独立人生

这里我直接定：

> **v0.1 中一个 Character Instance 只属于一个 User。**

但是“角色模板”可以共享。

即：

```text
              Character Template
              “这个角色初始是谁”
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
 User A Instance             User B Instance
       │                           │
自己的 Relationship           自己的 Relationship
自己的 Memory                 自己的 Memory
自己的 Timeline               自己的 Timeline
自己的 Shared Culture         自己的 Shared Culture
自己的 World Evolution        自己的 World Evolution
```

比如两个人都创建：

> 21 岁、天津人、大学生、嘴硬、喜欢摄影。

这只是共同 Seed。

创建的一瞬间就 fork：

```text
Template
   ↓
Character Instance A
Character Instance B
```

之后**永不共享运行时记忆**。

所以未来多用户也绝对不是：

```text
100 用户
↓
同一个角色数据库
```

而是：

```text
100 个 Character Instance
↓
同一套 Runtime
```

每个 Instance 有自己的 Mailbox，保证同一角色内部事件串行。

### 暂时不做多人共享同一个角色世界

例如：

> 我跟朋友同时认识同一个 AI，她认识我们两个人。

这会立即引入：

- 多关系图；
- 信息权限；
- 谁告诉她什么；
- 信息能不能转述；
- 多用户同时发消息；
- 同一 Timeline；
- 隐私边界。

这应该是未来完全独立的能力。

**v0.1 明确禁止。**

---

# 3. “用户明确纠正优先级最高”这句话确实需要修改

原来的说法太宽。

用户只能对**自己具有权威的信息**进行最高优先级纠正。

必须引入一个很重要的东西：

> **Truth / Claim / Belief 分离。**

例如用户说：

> 你明明出生在上海。

如果角色 Canon 写的是天津，她不能立刻：

> 哦对，我出生在上海。

因为用户没有修改角色历史的权限。

应该区分：

### A. User Self Truth

用户说：

> 我刚才说错了，我生日是 3 月 7 日，不是 3 月 8 日。

对于**用户自己的事实**：

```text
explicit user correction
→ 最高权限
→ supersede 旧记录
```

### B. Character Canon

用户：

> 你小时候不是学过钢琴吗？

但 Character Canon：

> 没学过。

这只是：

```text
User Claim
```

不是 Canon Correction。

角色可以：

> 我什么时候学过钢琴了

甚至因此产生新的 Relationship Event。

### C. World Truth

角色今天设定：

> 下午和室友出去吃饭。

用户：

> 你下午不是在图书馆吗？

同样不能因为用户这么说就改世界数据库。

这是：

```text
User perception / claim
```

而不是 World Mutation。

### D. Relationship History

已经发生：

> 9 月 10 日发生争执。

不能：

```text
DELETE event
```

之后用户说：

> 那次其实我没生气。

应该追加：

```text
新的解释 / correction
```

旧事件依然存在，但它的 interpretation 被修正。

---

因此 Runtime 应该存在三个认识层：

```text
Objective World
真实发生了什么

Character Belief
角色认为发生了什么

User Claim
用户声称发生了什么
```

这其实还有一个额外好处：

**角色可以自然地记错、误解，然后被纠正。**

真人本来就不是拥有数据库真理视角。

这对拟真反而非常有价值。

---

# 4. “什么时候算用户已经观察到事实”必须设计状态机

这一点截图里提得非常好。

假设系统生成：

> 我小学的时候学过一年吉他。

但这句话还没发出去。

绝对不能因此永久写进 Canon。

我建议定义：

```text
LATENT
↓
QUEUED
↓
SENT
↓
OBSERVED
```

具体：

### `LATENT`

模型产生了一个生活细节：

> 小学学过一年吉他。

但只是 Reply Bundle 的内容。

此时：

> **不是 Canon。**

---

### `QUEUED`

准备在 8 秒后发。

仍然：

> **不是 Canon。**

如果被用户新消息打断：

```text
cancel
↓
这个事实可以直接消失
```

用户从来没见过。

---

### `SENT`

微信通道明确接受了发送。

从这个时刻开始：

> **必须锁定事实。**

因为即使我们不知道用户有没有真正读到，他已经有可能看到。

不能第二天重新生成：

> 我从来没学过吉他。

所以：

```text
SENT
→ Disclosure Canon
```

---

### `OBSERVED`

有证据证明用户实际接触了这条信息。

例如：

用户：

> 你居然还学过吉他？

那么：

```text
SENT
→ OBSERVED
```

这时候属于双方共同世界的一部分。

---

## 最麻烦的是 `SEND_UNKNOWN`

比如：

```text
HTTP timeout
微信接口状态不明确
```

不能：

> 当没发过。

也不能：

> 硬当用户看见了。

所以单独：

```text
POSSIBLY_DISCLOSED
```

它的处理原则：

- 不允许以后生成与其矛盾的事实；
- 暂时不假定用户知道；
- 如果用户引用 → OBSERVED；
- 如果后续确认发送失败 → 回退；
- 长期无法确认 → 保留为内部锁定事实。

这是最保守、安全的处理。

所以我们之前提出的：

> Observation Commit

现在应该进一步精确成：

> **Disclosure Commit + Observation Confirmation**

---

# 5. 外部依赖全部放进 Phase 0 的“实测清单”

这个也完全同意。

目前文档里关于：

- 微信主动发送；
- OpenClaw 行为；
- OpenViking；
- Agnes；
- DeepSeek；
- API 字段；
- 模型名称；
- Structured Output；
- Vision；
- License；

凡是没有实际验证过的，都只能算：

> **Design Assumption**

不能让 Terra Max 按这些假设直接写正式 Adapter。

所以 GPT-6 Work 第一项任务应该不是：

> 开始开发。

而是建立：

```text
docs/verification/
```

概念上记录：

```text
WeChat Capability Verification
LLM Provider Verification
OpenViking Verification
License Verification
```

其中必须保存实际：

```text
文档来源
版本
执行命令
请求
响应
错误
测试日期
结论
```

特别是 API：

**绝不允许根据 OpenAI-compatible 这几个字就猜字段。**

先实际验证，然后才实现 Provider。

这也符合你之前定的开发原则。

---

# 6. 截图最后提到“设计文档未跟踪”也应该解决

这个虽然是小问题，但开发开始前处理掉。

第一个正式 Git commit 我反而建议只做：

```text
Project bootstrap
+
照影设计文档
+
Architecture decisions
```

然后才写代码。

这样后面 Work 审计 Terra Max 时可以明确比较：

```text
设计要求
vs
当前实现
```

否则设计文件一直是 working tree 的 untracked 文件，很容易随着开发被遗忘。

---

# 另外我想借这次反馈再补一个重要设计：角色有“两种历史”

我们之前实际上已经隐约有了，但现在最好正式确立。

### Objective History

数据库中的客观事实：

```text
9/16 14:00 上课
9/16 14:22 用户发消息
9/16 14:22:31 角色回复
```

### Subjective History

角色自己如何记忆这些事情：

> 那节课特别无聊，他突然找我，所以我偷偷回了消息。

OpenViking主要应该服务第二种。

PostgreSQL保存第一种。

于是：

```text
PostgreSQL
= What actually happened

OpenViking
= What this person remembers about what happened
```

这个区别非常关键。

因为真人不是数据库。

某件客观上很小的事情：

> 用户晚上随口说了一句“你今天挺可爱的”。

Objective importance 很低。

但角色可能：

```text
subjective_salience = very high
```

三个月以后还记得。

这正是“人格化记忆”和普通 RAG 的区别。

---

# 所以现在我会冻结这 6 条 ADR

在真正开发前不再讨论它们：

1. **Phase 0 不做 Memory；v0.1 才集成 OpenViking。**
2. **一个 User × 一个 Character Instance，一段独立人生。**
3. **User correction 只对用户自身事实具有最高权威；角色和世界有自己的事实权威。**
4. **生成事实只有成功暴露后才进入不可矛盾区域；区分 LATENT / QUEUED / SENT / OBSERVED / POSSIBLY_DISCLOSED。**
5. **所有外部接口在编码前必须实际验证，不依据文档中的假设字段实现。**
6. **PostgreSQL 保存客观历史，OpenViking 保存角色主观长期记忆。**

我认为把这六项补进《照影》设计文档之后，**架构层已经足够冻结**。接下来再继续抽象的收益已经很低，应该开始 Phase 0 实验了。