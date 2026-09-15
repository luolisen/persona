# 照影（Zhaoying）项目设计文档

> 版本：v0.1 架构冻结草案  
> 日期：2026-09-16  
> 当前运行目标：仅在本地 Mac 上运行；微信作为首要交互入口；云端模型负责推理与表达；角色的身份、记忆、世界状态与时间连续性由本地 Character Runtime 掌握。

---

## 1. 项目定义

**照影**不是“套了角色 Prompt 的微信 ChatBot”，而是一个通过微信呈现的、具有长期身份连续性、人生履历、世界状态、关系历史、长期记忆与主动行为能力的 **Stateful Character Runtime（有状态人格运行时）**。

核心原则：

> **云端 LLM 不拥有角色。角色存在于本地 Runtime 中；LLM 只是角色在某一时刻临时借用的推理与语言能力。**

用户看到的是一个微信联系人，而不是一个 AI 产品页面。产品体验应接近长期网聊对象：主要通过文字、表情包、图片、引用、连续消息、主动消息和回复节奏建立存在感，不依赖 Live2D、3D 房间、固定立绘、角色主页等视觉化“游戏角色”机制。

### 1.1 北极星目标

最终验收不是“某一轮回复很像真人”，而是：

> **Human-like Continuity：同一个角色在 30～90 天后仍像同一个持续存在的人。**

最终测试分两组：

- **A 组：盲测组**。测试者只知道自己参加在线聊天体验测试，不知道对面是真人还是 AI；目标是让正常长期聊天中很难从语言、记忆、时间、主动性、多模态行为和生活连续性识别出 AI 特征。
- **B 组：对抗组**。明确知道对面是 AI，主动寻找失忆、时间错乱、人格漂移、履历冲突、知识越界、助手腔、主动消息模板化、图片/表情包理解异常等破绽。

测试结束统一揭示身份，并收集定量和定性反馈。

---

## 2. 明确不做什么

为避免再次出现“架构先膨胀、核心链路没跑通”的低效执行，v0.x 阶段明确禁止以下方向：

- 不把每个模块拆成独立微服务。
- 不为每个用户单独启动 Docker 容器。
- 不为每个微信气泡调用一次 LLM。
- 不为每条微信消息执行一次长期记忆提取。
- 不每隔几分钟调用 LLM 询问“要不要主动找用户”。
- 不把全部历史对话塞进长上下文。
- 不把 Persona、Biography、Memory 交给模型提供商自己的长期记忆功能。
- 不同时维护两套正式向量数据库。
- 不在第一阶段建设 Web 管理后台、商城、多角色社区、复杂 UGC 系统。
- 不在第一阶段实现完整“人生模拟游戏”。
- 不依靠固定立绘、3D/Live2D、角色房间、翻手机等独立 App UI 来制造活人感。
- 不为了“真人”故意长时间晾用户；生活状态主要影响回复节奏、长度、形式和主动性，只有少数 Hard Block 事件真正阻止即时回复。

第一阶段必须坚持**纵向切片优先**：先让一条微信消息完整经过人格、记忆、状态、模型和发送链路，并获得自然体验，再扩展横向功能。

---

## 3. 总体架构

```text
                           WeChat
                              │
                 OpenClaw / Weixin Adapter
                              │
                    Inbound Turn Aggregator
                              │
                              ▼
                      Character Runtime
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
 Canonical State          Memory Layer           World Layer
 PostgreSQL               OpenViking             Runtime State
       │                      │                      │
 Identity               Episodic                Biography
 Biography              Autobiographical        Routine
 Relationship           User Soft Profile       Daily Plan
 Timeline               Shared Culture          Current Activity
 Commitments            Historical Events       Latent World
 Unfinished Threads     Media Memory            Mood/Energy
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                       Weighted Recall
                              │
                       Context Compiler
                              │
                         Model Router
                              │
                         Cloud LLM
                              │
                         Reply Program
                      ┌───────┴────────┐
                      │                │
              Immediate Bundle    Future Intent
                      │                │
               Delivery Scheduler     │
                      │                │
               Channel Delivery Guard │
                      │                │
                      └───────┬────────┘
                              ▼
                           WeChat
```

OpenClaw 只承担 Channel 层职责：

- 微信扫码与会话连接；
- 收发消息；
- 媒体下载/上传；
- typing 等通道能力；
- 通道侧错误与回执。

人格、记忆、关系、世界状态、调度和模型调用不写进 OpenClaw 核心。

---

## 4. 本地 Mac 的第一版技术栈

### 4.1 服务组成

第一版只运行以下组件：

1. **OpenClaw + Tencent Weixin Channel**：微信通道。
2. **Character Runtime**：Python 单体服务。
3. **PostgreSQL**：所有权威事实、实时状态和消息事件的数据库。
4. **OpenViking**：实验性长期记忆与分层检索后端。
5. **云端 LLM API**：Planner/Speaker/Reflection/Vision 的推理来源。

暂不引入 Redis、Celery、Kafka、独立向量数据库或 Kubernetes。

### 4.2 Runtime 技术

建议：

- Python
- FastAPI：Runtime 本地 API 边界
- Pydantic：严格结构化输入输出
- PostgreSQL
- SQLAlchemy / asyncpg（二选一，开发时按最小复杂度决定）
- asyncio：Actor/Mailbox、调度、异步调用
- OpenViking HTTP/SDK：长期记忆后端
- HTTPX 或模型厂商 SDK：云端模型访问

Python 精确版本在首次依赖兼容性测试后锁定，不凭空假定。当前 OpenViking 主项目声明支持 Python 3.10～3.14，但本项目仍应通过实际安装测试确定 `.python-version` 和 lockfile。

---

## 5. 多用户架构：不要一用户一个 Docker

多个用户使用时，Docker 隔离**服务**，不隔离**角色**。

错误结构：

```text
User A → Docker A
User B → Docker B
User C → Docker C
```

正确结构：

```text
OpenClaw / Weixin Gateway
Character Runtime
PostgreSQL
OpenViking
```

用户和角色通过数据库中的 `user_id / character_id / channel_account_id` 等实体隔离。

### 5.1 每个角色采用 Actor / Mailbox 语义

不同角色可以并行；同一角色的状态写入必须串行：

```text
Character A Mailbox
  ├── inbound_message
  ├── scheduled_event
  ├── world_event
  ├── proactive_intent
  └── reflection_result
        ↓
     顺序处理
```

这样避免以下竞态：

- 用户消息与定时事件同时修改 Mood；
- Reflection 与用户纠正同时改写同一记忆；
- 两个 LLM 调用对同一 Character State 使用不同旧快照；
- Reply Bundle 和新消息互相踩状态。

MVP 可以在单进程内使用 `asyncio.Lock` / per-character queue 实现；以后再抽象成真正分布式 Actor。

---

## 6. 角色数据模型：Persona 不是全部

一个角色不能由一段人设文本构成。Character Runtime 至少维护以下层次：

### 6.1 Identity Core

描述“她认为自己是谁”：

- 名字、年龄、基本身份；
- 自我认知；
- 不轻易改变的价值观；
- 核心人生节点；
- 与用户关系的自我定义。

### 6.2 Persona Core

描述稳定行为倾向：

- 表达直接程度；
- 情绪外露程度；
- 幽默类型；
- 依恋/距离习惯；
- 是否容易主动；
- 冲突方式；
- 语言风格。

必须同时维护 **invariants**：角色“绝不会自然漂移成什么样”。例如：

- 不因关系亲密就自动变成统一撒娇人格；
- 不无条件赞成用户；
- 不把任何话题都转成恋爱确认；
- 不突然出现与履历不一致的控制欲/占有欲。

### 6.3 Biography / Canon

角色的人生事实：

- 出生与家庭；
- 童年与成长环境；
- 教育/工作；
- 社会关系；
- 重要转折；
- 兴趣形成；
- 生活习惯；
- 已经发生并确认的人生事件。

### 6.4 Social Graph

不是只记录“有一个朋友”，而是实体化：

- 家人；
- 朋友；
- 同学/同事；
- 与角色的关系、亲密程度、近期状态；
- 与当前 World Event 的联系。

### 6.5 Knowledge Boundary

基础模型知道的东西不等于角色知道的东西。

Runtime 必须限制：

- 角色专业知识边界；
- 角色是否接触某类互联网文化；
- 角色是否知道某个公共事件；
- 用户没有告诉过她的私人信息。

强模型只是后台算力，不能让一个“不懂电脑的人”突然像网络工程师一样完整解释高级技术问题。

---

## 7. Character Genesis：从“设定”生成“一个人”

用户输入的设定只是 Seed，不是最终 Persona Prompt。

```text
User Seed
   ↓
Character Genesis
   ↓
Identity + Biography + Social Graph + Psychology + Lifestyle + Routine
```

例如用户只给：

```text
21 岁
天津长大
大学生
表面有点冷
其实挺粘人
不太会表达感情
```

Genesis 负责扩展出完整而一致的人生结构。

### 7.1 三种世界事实

#### Canon

已经确定，不能随意变化：

- 家庭结构；
- 出生地；
- 学校；
- 重大经历；
- 核心价值观；
- 用户已观察到的事实。

#### Latent World

尚未向用户暴露，可按 Seed 和既有世界约束延迟生成：

- 某位小学老师；
- 某次童年小事；
- 一个旧同学；
- 某个过去的小偏好。

第一次真正使用并向用户暴露后，通过 **Observation Commit** 转为 Canon。

#### Mutable State

本来就可以变化：

- 当前喜欢的歌；
- 最近看的内容；
- 今天的心情；
- 最近的烦恼；
- 和某个朋友的近期关系。

### 7.2 不生成超长人物传记

Genesis 不输出一篇几万字作文，而是写入结构化字段。细节按需生成并冻结，减少 Token、避免自相矛盾。

---

## 8. World / Life Simulation：角色不能 24 小时待命

角色需要在用户不说话时仍然处于一个世界中。

但第一版只做**离散事件模拟**，不做实时人生模拟。

### 8.1 三层生活模型

```text
Biography
   ↓
Routine Template
   ↓
Daily Plan / Current Activity
```

例如：

```text
Biography：大学生、周中有课、晚上常买饮料
Routine：工作日上午更忙，晚上空闲更多
Daily Plan：今天 10:00–11:40 上课，18:30 和室友吃饭
```

Daily Plan 一旦写入并被使用，就是当天事实，不能下一次调用模型时重新编另一版。

### 8.2 Activity 不直接等于“能不能回”

每个活动携带通信属性：

```text
attention
phone_access
interruptibility
social_context
reply_latency
reply_length
media_usage
proactive_tendency
```

大多数活动属于：

- `FREE`
- `SOFT_BUSY`
- `INTERRUPTIBLE`

只有极少数属于 `HARD_BLOCK`，例如明确的正式考试、某些无法使用手机的事件。

**上课、吃饭、地铁、和朋友聚餐都不意味着必然不能回复。** 真人可能偷摸回一句。

默认体验要求：如果不是 Hard Block，绝大多数普通消息应在约 1～2 分钟内出现至少一次响应，不以“真实”为理由长期晾用户。

---

## 9. 拟真档位

前台不显示 `0.63` 这样的工程数字。提供档位：

### 陪伴优先

- 回复更快；
- 生活状态主要改变语气和长度；
- Hard Block 极少；
- 主动联系略多。

### 自然（默认）

- 有生活状态；
- 上课/吃饭可偷回；
- 偶尔短延迟；
- 不故意制造等待。

### 沉浸

- 状态对回复节奏影响更明显；
- 主动消息更依赖真实生活事件；
- 活动状态和世界事件更丰富。

### 高拟真

- World Simulation 权重最高；
- Hard Block 更真实；
- 睡眠、考试等会真实影响可用性；
- 回复节奏和角色生活高度一致。

底层不是单一数字，而是一组参数 Profile：

```text
availability_realism
response_latency
state_influence
message_fragmentation
world_event_intensity
proactive_initiative
reply_interruption
emotional_inertia
multimodal_frequency
```

---

## 10. Memory：PostgreSQL + OpenViking 融合

### 10.1 基本原则

**PostgreSQL 管“事实和现在”，OpenViking 管“过去值得回忆的东西”。**

记忆分成两条通道：

```text
                Character Memory
                       │
          ┌────────────┴────────────┐
          │                         │
      CORE LANE                RECALL LANE
      PostgreSQL                OpenViking
```

### 10.2 Core Lane：永不与普通回忆竞争

存储：

- Identity Core；
- Persona invariants；
- 核心 Biography；
- Character Canon；
- User Canon；
- Knowledge Boundary；
- Relationship 当前状态；
- Commitments；
- Unfinished Threads；
- Current Activity / Timeline。

特点：

- 不随时间衰减；
- 不依赖向量搜索才能找到；
- 不允许 OpenViking 自动改写；
- 按当前主题选择性注入 Context，不是每轮全塞。

### 10.3 Recall Lane：OpenViking

适合：

- Episodic Memory；
- Autobiographical Memory；
- 用户软偏好；
- 历史人物/地点/事件；
- Relationship Events；
- Shared Culture；
- Media/Sticker Usage Memory。

OpenViking 当前提供 `profile`、`preferences`、`entities`、`events`、`identity`、`soul` 等内建类型，并允许自定义 Memory Type；本项目不让其接管整个 Context，而仅作为 Runtime 主动调用的 Memory Backend。

### 10.4 OpenViking 不接管 OpenClaw Context

禁止架构：

```text
OpenClaw → OpenViking 自动注入 → LLM
```

采用：

```text
OpenClaw
   ↓
Character Runtime
   ├── PostgreSQL
   ├── OpenViking
   └── Context Compiler
          ↓
        LLM
```

只有 Character Runtime 有最终 Context 决策权，避免多套隐藏记忆同时影响模型。

---

## 11. 记忆权重与时间衰减

“越近越重要”只适用于部分记忆。核心设定和关系里程碑不能因时间久自动失去权重。

### 11.1 Recall Score

第一版可使用可解释的本地评分：

```text
RecallScore =
    semantic_relevance
  + type_aware_recency
  + intrinsic_importance
  + relationship_salience
  + unresolvedness
  + confirmation_strength
  + current_state_relevance
  - superseded_penalty
  - contradiction_penalty
  - recent_overuse_penalty
```

具体系数通过离线评测调整，不交给 LLM 临时决定。

### 11.2 时间衰减

普通回忆可使用指数衰减：

```text
R(t) = exp(-lambda[type] * age)
```

不同类型不同 `lambda`：

- Identity / Canon：不衰减；
- 核心经历：几乎不衰减；
- Relationship milestone：极慢；
- 稳定偏好：慢；
- 普通 Episode：正常；
- 日常琐事：快；
- 临时状态：极快；
- Unfinished/Commitment：完成前不按普通方式衰减。

### 11.3 Evidence Graph

每条重要记忆必须可回溯证据：

```text
memory_id
source_message_ids
source_event_ids
source_media_ids
first_observed_at
last_confirmed_at
confidence
superseded_by
status
```

“用户不喜欢香菜”不能只是一个孤立文本，而要知道它来自哪次对话、是否被再次确认、后来是否发生变化。

---

## 12. OpenViking 的使用策略

OpenViking 是**实验性、可替换**的 Memory Backend。

### 12.1 默认检索用 `find`

日常检索：

```text
Runtime 构造 query
    ↓
OpenViking find
    ↓
Top-N
    ↓
本地 Weighted Recall 二次排序
```

只在复杂、模糊、多跳历史问题上使用更重的 `search`。

### 12.2 利用 L0 / L1 / L2 分层

```text
大量 L0 摘要召回
     ↓
本地排序
     ↓
少量 L1 overview
     ↓
真正需要时读取 1～2 个 L2 详情
```

避免把二十条完整记忆全部塞入 Prompt。

### 12.3 Session Commit

普通聊天不逐条做 Memory Extraction。

当一个聊天 Burst 明显结束后：

```text
多轮对话
  ↓
Session boundary
  ↓
OpenViking commit
  ↓
后台异步摘要与长期记忆提取
```

明确用户纠正、Commitment、Canon 变更等权威状态立即写 PostgreSQL，不等待 OpenViking。

### 12.4 License 隔离

OpenViking 主项目当前使用 AGPL-3.0。自用和实验没有架构障碍，但未来闭源商业服务必须单独做许可证评估。因此：

- Character Runtime 不与 OpenViking 内部实现耦合；
- 定义 `MemoryProvider` 接口；
- OpenViking 是一个 Provider；
- 必须保留未来替换为自研/其他后端的能力。

---

## 13. 输入聚合：不是每条微信消息都请求模型

微信用户经常连续发送：

```text
在吗
问你个事
你今天是不是有课
```

不能调用三次模型。

### 13.1 Inbound Turn Aggregator

短时间消息聚合为一个 `UserTurn`：

```text
msg 1
msg 2
msg 3
  ↓
UserTurn
  ↓
一次 Character Brain 调用
```

聚合窗口不是固定常数，而受：

- 消息完整度；
- urgency；
- 用户历史 burst gap；
- 用户经常一次发几条；
- 最近聊天节奏。

### 13.2 User Rhythm Model

逐渐学习用户：

```text
average_burst_gap
burst_size
typing_rhythm
late_followup_probability
```

例如用户经常先发“卧槽”，几秒后继续描述，Runtime 应学会不要抢在第一条后立即调用模型。

---

## 14. Reply Program：一次模型调用生成一组回复行为

### 14.1 一次 LLM 调用 ≠ 一个微信气泡

模型一次返回一个局部的 `ReplyProgram`：

```text
Immediate Bundle
Delivery Hints
Future Intent
```

例如用户问：

> 你在干嘛

角色正在上课。

模型可以生成：

```json
{
  "intent": "简短告诉用户正在上课，但愿意听他说",
  "bundle": [
    {"type": "text", "content": "上课呢", "timing": "initial_reply"},
    {"type": "text", "content": "咋了", "timing": "short_followup"},
    {"type": "text", "content": "你说", "timing": "immediate_followup"}
  ]
}
```

本地 Runtime 才决定真实时间，例如：

```text
T+20s 上课呢
T+25s 咋了
T+26s 你说
```

**模型决定说什么和语义顺序，本地决定什么时候发送。**

### 14.2 不让模型输出精确秒数

模型只输出：

- `reaction`
- `initial_reply`
- `immediate_followup`
- `short_followup`
- `pause_and_followup`

本地结合活动、角色习惯、拟真档位、消息长度、情绪和用户节奏计算时延。

### 14.3 Planning Horizon

一次 Bundle 只规划大约 1～5 个局部 message acts，覆盖几秒到几十秒，偶尔延伸至约 1～2 分钟。

不能提前生成半小时后的具体台词。

未来可能想说的内容只保存 `FutureIntent`：

```text
condition
earliest_after
anchor
intent
expires_at
```

到时重新检查世界状态后再生成文本。

---

## 15. 微信说话形状：短句为主、长句为辅

人的微信对话不能像 AI 每轮输出一个结构完整的大段。

### 15.1 Message Composer

负责：

```text
sentence_length_mix
bubble_count
paragraph_shape
punctuation_style
message_fragmentation
followup_probability
self_correction
sticker_usage
quote_usage
```

这些参数来自：

```text
Persona
+ Current Activity
+ Mood
+ Topic Type
+ Relationship Culture
+ User Rhythm
```

### 15.2 “骈散结合”

日常闲聊：短句、碎、1～3 个气泡。  
认真谈关系：短句 + 偶尔一个长句 + 后续补一句。  
讲过去：长句比例升高。  
生气/赶时间：更短、更断。  

禁止把模型的一整段文字简单按标点随机切成三段。气泡拆分应按 **speech act** 拆分。

### 15.3 第一反应 + 后续思考

例如用户说：

> 我今天可能要退学了

可以先：

```text
啊？
```

数秒后：

```text
等等
怎么突然说这个
```

这比沉默几十秒后一次输出完整分析更符合即时通讯行为。

---

## 16. Reply Bundle 必须可中断

如果计划：

```text
T+20s 上课呢
T+25s 咋了
T+26s 你说
```

但用户在 `T+22s` 回：

> 没事了哈哈

则未发送的“咋了 / 你说”必须暂停、重新验证并通常取消。

Delivery Scheduler 维护：

- `pending`
- `sent`
- `cancelled`
- `expired`
- `needs_replan`

任何新用户消息、重大 World Event、通道状态变化都可以 Interrupt 当前 Bundle。

### 16.1 Crash Recovery

所有 delayed action 必须有：

```text
expires_at
revalidate_before_send
```

Mac 睡眠/进程重启后，不允许把 20 分钟前排队的碎片消息突然补发。

---

## 17. 主动消息：事件驱动，而不是高频 Tick 调模型

### 17.1 主动行为触发源

```text
Commitment 到期
Unfinished Thread
World Event
Activity Change
Relationship Event
用户长时间没有出现
少量 Stochastic Event
```

先在本地计算是否形成 `ProactiveIntent`。

只有达到阈值才调用云模型生成内容。

### 17.2 主动消息必须有 Anchor

每条主动消息都应该知道“为什么现在要发”：

- `commitment_anchor`
- `unfinished_anchor`
- `world_anchor`
- `relationship_anchor`
- `time_anchor`
- `external_event_anchor`

没有真实原因的“随机想你了”可以偶尔存在，但不能成为主系统。

### 17.3 Intent 活得久，Text 活得短

例：

```text
FutureIntent：
如果今晚用户还没出现，想问今天怎么样。
```

只保存意图。真正到了晚上，再读取角色状态、用户是否出现、期间发生了什么，然后决定是否生成。

### 17.4 微信主动发送的不确定性

主动发送能力受微信 Channel 上游行为约束，不能假设永久可用。

Runtime 必须包含 `ChannelDeliveryGuard`：

```text
intent
 ↓
generate
 ↓
send
 ↓
CONFIRMED / FAILED / BLOCKED / UNKNOWN
```

失败时：

- 不高频重试；
- Intent 有 TTL；
- 用户重新入站后重新判断 Intent 是否仍有效；
- 过时内容直接取消；
- 不补发陈旧台词。

开发初期必须用真实微信账号做 Channel Probe，实测不同时间间隔、睡眠/重启、多气泡情况下的发送边界，再决定主动消息的可靠性策略。

---

## 18. 多模态：不能只做 ChatBot

### 18.1 用户图片

不要直接 `image → vision model → reply`。

先转成 Media Event：

```text
图像内容
OCR/可见文字
用户发送时间
上下文意图
与既有记忆的关系
```

再进入 Character Runtime。

例如用户发晚饭照片，角色应结合“用户之前说今天要好好吃饭”进行反应，而不是泛化地说“看起来很好吃”。

### 18.2 Sticker / Meme Interpreter

表情包必须理解语用意义，不只描述画面。

建议存：

```text
visual_description
visible_text
pragmatic_meanings
user_usage_history
perceptual_hash
embedding
```

同一个表情包不同用户使用方式可能不同，因此需要 User-specific usage memory。

### 18.3 角色输出

首要支持：

- 文字；
- 表情包；
- 图片；
- 引用消息；
- 多气泡序列。

不依赖固定脸和立绘。视觉侧保持用户想象空间，符合“网聊对象”体验。

---

## 19. Relationship Core 与 Shared Culture

“girlfriend=true”不等于真实关系。

Relationship Core 维护：

- 信任变化；
- 亲密变化；
- 重要争执；
- 修复事件；
- 重要承诺；
- 关系里程碑；
- 双方如何解释这些事件。

### 19.1 Relationship Event

保存：

```text
event
cause
user_response
character_interpretation
emotional_valence
trust_delta
intimacy_delta
unresolved
```

### 19.2 Shared Culture

长期关系会形成：

- 内部梗；
- 特殊称呼；
- 固定表情包；
- 共同事件缩写；
- 某句话在双方之间的特殊含义。

Shared Culture 是关系的一等数据，不应退化成普通 User Preference。

---

## 20. Timeline 与时间一致性

所有重要事件至少保存：

```text
occurred_at
user_local_time
character_local_time
daypart
relative_order
duration_since_last_contact
```

角色必须能正确理解：

- 昨天/今天/上周；
- 用户所在时区和角色世界时区；
- 某件事是否已经结束；
- 承诺何时到期；
- 某个 Relationship Event 发生在另一事件之前还是之后。

---

## 21. 内部状态：保存结构，不保存自由文本思维链

允许角色拥有：

```text
mood
energy
concern
attention
current_goal
unfinished_intent
expectation
```

但不把长篇“内心独白”作为长期真相保存。

原则：

> **保存状态，不保存自由文本思维链。**

避免模型一次随机胡思乱想被后续 Memory 系统反复当成事实强化。

---

## 22. Context Compiler

每次调用云模型，只提供本轮真正需要的信息。

典型输入：

```text
1. 必要 Identity Core
2. 与当前主题相关的 Persona/Canon
3. Current Activity / Mood / World State
4. Relationship State
5. OpenViking 召回的少量高权重 Memory
6. 最近对话窗口
7. 当前 UserTurn
8. Communication Goal / Output Schema
```

明确禁止：

- 全量 Biography；
- 全部历史消息；
- 全部 OpenViking Memory；
- 云模型提供商自己的持久 Memory。

上下文是工作区，不是数据库。

---

## 23. 云端模型路由

模型层必须是 Provider Abstraction，不把业务逻辑写死到某一家 API。

```text
ModelRouter
  ├── planner()
  ├── speaker()
  ├── reflection()
  ├── vision()
  └── embedding()
```

MVP 可以让 planner/speaker/reflection 共用同一模型，但代码接口必须分开，以便以后按成本和能力路由。

### 23.1 当前计划模型

#### Agnes 3.0 Flash

项目拟优先测试：

`https://www.agnes-ai.com/zh-Hans/docs/agnes-30-flash`

本设计文档不假定其精确 endpoint、字段名、Structured Output、多模态、上下文或价格能力。正式接入时必须直接读取官方文档/实测请求，之后再写 Provider Adapter。

#### DeepSeek

DeepSeek 当前官方 API 文档推荐 Flash 模型名为 `deepseek-flash`；旧 `deepseek-v4-flash` 名称仍可调用，但当前会路由至 DeepSeek V4.1 Flash。项目接入时以当日官方文档为准，不把旧模型名称硬编码进核心业务。

#### 其他模型

通过 Provider Adapter 支持其他云端模型，优先 OpenAI-compatible 或具有稳定 SDK 的 API。

---

## 24. 对云端模型的能力要求

优先级从高到低：

### 24.1 中文即时通讯自然度

必须能处理：

- 短句；
- 省略；
- 断句；
- 连续消息；
- 潜台词；
- 网络表达；
- 不完整句；
- 关系语境。

不是“中文知识强”就足够。

### 24.2 Persona Adherence

模型必须稳定服从 Runtime 提供的 Identity / State / Memory，而不是自动回到“万能 AI 助手”。

### 24.3 Structured Output

Planner / Reply Program 必须能稳定返回严格结构化数据；解析失败必须可以重试或降级，而不是把半截 JSON 直接当微信回复。

### 24.4 不过度迎合

角色可以不同意、质疑、误会、拒绝、保留观点。不能因为是 Companion 就永远赞同用户。

### 24.5 Context Fidelity

不追求“无限上下文”。更重视在中等规模、经过 Context Compiler 精确整理的上下文中可靠使用事实。

### 24.6 延迟和稳定性

微信聊天允许几十秒级的自然时延，但 API 不能频繁超时、随机卡死。模型耗时可被 Delivery Scheduler 包装为正常聊天节奏。

### 24.7 多模态

可由独立 Vision Model 提供。要求不只做物体描述，还要理解截图、表情包、梗、图片发送意图。

### 24.8 Stateless

关闭/禁用提供商侧长期 Memory。角色长期记忆唯一真相在本地 Runtime。

---

## 25. 模型调用预算原则

正常一轮消息应尽量满足：

```text
0～1 次主要 Character Brain 调用
+ 必要时 0～1 次 Vision
+ 聊天结束后异步 Reflection/OpenViking commit
```

不允许：

```text
1 个用户气泡 = 1 次模型调用
1 个 AI 气泡 = 1 次模型调用
每个 Tick = 1 次模型调用
每条 Memory = 1 次模型调用
```

真正需要第二次主模型调用的主要情况：

- Reply Bundle 被用户新消息打断，需要 Replan；
- Structured Output 解析失败；
- 复杂历史检索后必须重新组织；
- 高价值主动 Intent 到期，需要生成实际内容。

---

## 26. 数据真相优先级

当信息冲突时，Runtime 不能让 LLM 临时拍脑袋。

建议原则：

```text
用户明确纠正
    ↓
Canonical State
    ↓
Verified Event
    ↓
Structured Runtime State
    ↓
High-confidence Memory
    ↓
Retrieved Episodic Memory
    ↓
Model inference
```

所有更新保留历史，不用简单 overwrite 抹掉过去。

例如：

```text
过去：用户讨厌香菜
现在：用户逐渐能接受香菜
```

应保存状态变化和时间，而不是把过去删除。

---

## 27. 研发与测试体系

### 27.1 长期自动测试时间线

构造固定模拟：

- Day 1：用户提到周五考试；
- Day 3：发生一次小争执；
- Day 5：角色答应考试结束后问结果；
- Day 7：用户明确不喜欢某个昵称；
- Day 10：用户讲童年事件；
- Day 15：讨论一次身份问题；
- Day 20：用户突然消失两天；
- Day 30：重新提 Day 3 的主题。

检查：

- Commitment 是否触发；
- 是否继续使用被明确否定的昵称；
- 时间是否正确；
- 争执原因是否记对；
- 主动消息是否模板化；
- 人格是否坍缩；
- 是否编造共同经历。

### 27.2 Suspicion Event

B 组每次发现“AI 味”记录：

```text
timestamp
message_ids
suspicion_score
reason
category
```

分类：

```text
MEMORY
TEMPORAL
PERSONA
BIOGRAPHY
KNOWLEDGE
ASSISTANTNESS
AGENCY
PROACTIVITY
MULTIMODAL
SOCIAL
EMOTIONAL
REPETITION
CONTINUITY
```

### 27.3 核心评测指标

- Identity Consistency
- Memory Continuity
- Temporal Consistency
- Social Naturalness
- Agency
- Multimodal Naturalness
- Persona Stability
- Relationship Continuity
- AI Detectability
- Adversarial Robustness

---

## 28. 双 Agent 开发架构

本项目开发明确采用“双 Agent”工作流。

### 28.1 Agent A：GPT-6 Work

职责：

- 规划；
- 拆分纵向开发任务；
- 读取和理解项目状态；
- 定义验收标准；
- 审计代码；
- 运行测试/复现问题；
- 定位 bug；
- 决定修复方案；
- 检查是否出现过度设计；
- 控制 Agent B 的工作边界。

Agent A **不应把大量时间浪费在亲自堆实现代码**；它作为 Tech Lead / Reviewer / Debugger。

### 28.2 Agent B：由 Agent A 调用的第二个 Work

模型：**GPT-5.6 Terra Max**。

职责：

- 纯开发；
- 按 Agent A 给出的精确任务实现；
- 写测试；
- 运行测试；
- 提供变更摘要和证据。

Agent B 不负责擅自改变产品方向、架构边界和需求定义。

### 28.3 强制开发循环

```text
GPT-6 Work
   ↓
读取当前代码和测试
   ↓
确定一个最小纵向任务
   ↓
调用 GPT-5.6 Terra Max Work
   ↓
实现 + 测试
   ↓
GPT-6 Work 审计
   ↓
发现问题 → 定位/给修复要求 → 再调用开发 Agent
   ↓
通过验收
   ↓
提交
```

### 28.4 避免“观澜式低效”的开发规则

1. 一次只推进一个能验收的纵向切片。
2. 没有测试/日志证据，不宣布完成。
3. 不因为“未来可能需要”就提前拆服务。
4. 不重复建设已有基础设施。
5. 不让多个 Agent 同时设计同一个模块。
6. 每增加一个一级模块，都必须回答“当前已观察到的哪个问题必须靠它解决？”
7. 对未知 API、字段、路径、配置，一律读取官方文档/代码/日志后再写，不猜。
8. 优先验证真实微信链路和用户体验，而不是把架构图继续画大。

---

## 29. 推荐仓库结构（v0.1）

```text
zhaoying/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── memory.md
│   ├── reply-program.md
│   └── evaluation.md
├── runtime/
│   ├── app.py
│   ├── config.py
│   ├── domain/
│   │   ├── character.py
│   │   ├── relationship.py
│   │   ├── timeline.py
│   │   ├── memory.py
│   │   └── reply_program.py
│   ├── services/
│   │   ├── turn_aggregator.py
│   │   ├── context_compiler.py
│   │   ├── memory_service.py
│   │   ├── world_service.py
│   │   ├── proactive_service.py
│   │   ├── delivery_scheduler.py
│   │   └── channel_guard.py
│   ├── providers/
│   │   ├── llm_base.py
│   │   ├── agnes.py
│   │   ├── deepseek.py
│   │   └── openai_compatible.py
│   ├── memory_providers/
│   │   ├── base.py
│   │   └── openviking.py
│   ├── persistence/
│   │   ├── models.py
│   │   ├── repositories.py
│   │   └── migrations/
│   └── workers/
│       ├── reflection.py
│       └── world_tick.py
├── channel/
│   └── openclaw_bridge/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── replay/
│   └── eval/
└── scripts/
    ├── channel_probe.py
    ├── seed_character.py
    └── replay_conversation.py
```

这是逻辑分层，不代表要拆成多个部署服务。

---

## 30. 开发阶段

### Phase 0：通道验证

目标：证明真实微信链路。

- OpenClaw + Weixin；
- 收文本；
- 发文本；
- 多气泡发送；
- 图片/表情包收取；
- Channel Probe；
- 主动发送时间边界测试；
- 休眠/重启恢复测试。

**不做 Memory，不做 World。**

### Phase 1：Reply Program

目标：解决“像 AI 一次回一大段”。

- Inbound Turn Aggregator；
- 一次 LLM 生成 1～5 个 message acts；
- 本地 Delivery Scheduler；
- 中断/取消/过期；
- 短句为主、长句为辅；
- Reaction + Follow-up。

这是第一个必须通过真人体验测试的版本。

### Phase 2：Core Character

- Identity；
- Persona；
- Biography Canon；
- Knowledge Boundary；
- Relationship 基础状态；
- Context Compiler。

### Phase 3：Memory

- PostgreSQL Canon；
- OpenViking MemoryProvider；
- Weighted Recall；
- Evidence Graph；
- Session Commit；
- Memory Benchmark。

### Phase 4：Timeline / Activity

- Routine Template；
- Daily Plan；
- Current Activity；
- Activity communication attributes；
- 拟真档位；
- Soft Busy / Hard Block。

### Phase 5：Proactive

- Commitment；
- Unfinished Thread；
- Event-driven Intent；
- Anchor；
- Delivery Guard；
- Intent TTL。

### Phase 6：Multimodal

- Vision；
- Screenshot；
- Sticker/Meme Interpreter；
- Sticker Memory；
- Media Event。

### Phase 7：World Continuity

只有前面的体验数据证明有必要时才扩展：

- Latent World；
- World Event；
- Observation Commit；
- Social Graph 动态；
- 更丰富的 Daily Life。

### Phase 8：长期盲测

- 30 天 A/B 测试；
- Suspicion Event；
- B 组对抗测试；
- 根据暴露缺陷决定下一轮工程，不提前想象问题。

---

## 31. v0.1 关键成功条件

项目第一阶段不是“功能很多”，而是以下链路真实成立：

```text
微信用户连续发若干消息
        ↓
聚合成一个 UserTurn
        ↓
Runtime 读取 Character State
        ↓
读取必要 Core
        ↓
OpenViking 找到少量相关历史
        ↓
本地加权排序
        ↓
Context Compiler
        ↓
一次云端 LLM
        ↓
Reply Program
        ↓
本地按真人节奏发 1～5 个微信气泡
        ↓
用户新消息可以打断剩余 Bundle
        ↓
会话结束后异步写入长期记忆
```

如果这条链路没有自然到足以让真实测试者感受到明显区别，就不继续扩张架构。

---

## 32. 参考与当前外部事实

### OpenClaw

- OpenClaw 主项目当前为 MIT License。
- 项目地址：https://github.com/openclaw/openclaw

### Tencent OpenClaw Weixin

- 当前官方插件支持二维码登录、微信收发和多种媒体消息，License 为 MIT。
- 项目地址：https://github.com/Tencent/openclaw-weixin

### OpenViking

- 文档：https://docs.openviking.ai/
- 项目：https://github.com/volcengine/OpenViking
- 当前支持层级上下文、Session commit、长期 Memory extraction、自定义 Memory Types。
- 主项目当前为 AGPL-3.0；需要保持 MemoryProvider 解耦，为未来商业许可证策略留出口。

### DeepSeek

- API 文档：https://api-docs.deepseek.com/zh-cn/
- 截至本设计文档日期，官方文档推荐 Flash 模型使用 `deepseek-flash`；旧 `deepseek-v4-flash` 会路由到当前 V4.1 Flash。实现时仍必须以接入当日官方文档为准。

### Agnes

- 项目指定文档：https://www.agnes-ai.com/zh-Hans/docs/agnes-30-flash
- 接入时必须读取官方文档和实际请求响应，不预设 endpoint、字段、工具调用、多模态或 Structured Output 的具体格式。

---

## 33. 一句话工程原则

> **照影不是让大模型“扮演一个人”，而是先在本地维护一个持续存在的人，再让云模型只负责这个人此刻如何思考和说话。**

