## Context

这是一个全新的工程（`D:/code/temp`），不涉及现有代码迁移。pi 终端没有内置的终端间通信能力。本次设计的目标是：在不引入外部依赖的前提下，为多个 pi 终端建立对等的一对一查询渠道。

核心约束：
- 零外部 npm 依赖（仅使用 Node.js 内置模块和 pi SDK）
- 同机器多窗口场景
- 用户可自主选择是否加入"交流圈"

## Goals / Non-Goals

**Goals:**
- 多个 pi 终端可以通过共享文件发现彼此
- 终端间可以通过信箱文件交换查询和回答
- 接收方用自己的 LLM 回答查询，不干扰当前工作流
- 用户通过 `/peer-join` / `/peer-quit` 控制是否可被查询
- 终端崩溃后能被同伴及时识别为离线

**Non-Goals:**
- 跨机器通信（本期不涉及）
- 广播 / 群发消息
- 多轮对话（每次查询独立）
- 文件传输 / 附件
- 实时通知推送（文件轮询的延迟可接受）

## Decisions

### 发现机制：共享 JSON 文件
所有终端共同读写 `~/.pi/peers.json`，每个在线终端占一个 key。

- **选型**：不引入 mDNS、TCP/UDP 广播、注册中心
- **理由**：同机器场景共享文件是最简单可靠的方式，零额外依赖
- **替代方案**：mDNS（跨机器友好，但依赖多播 DNS，Windows 上不稳定）；HTTP 注册（需要额外服务器，违反对等原则）

### 通信机制：信箱目录 + 文件轮询
查询写入 `~/.pi/mailbox/{接收者ID}/q-*.json`，接收方轮询发现后处理，回答写入 `~/.pi/mailbox/{发送者ID}/a-*.json`。

- **选型**：不引入 HTTP、WebSocket、Unix Socket、消息队列
- **理由**：文件系统是最低成本的 IPC 方式，进程退出自动清理，无需端口管理
- **替代方案**：HTTP 服务器（需管理端口分配和冲突）；Unix Socket（Windows 上体验不一致）

### 查询处理：注入 LLM 会话
接收方轮询到查询后，通过 pi 的消息队列（steer/followUp）将查询注入当前活跃的 LLM 会话。

- **选型**：不在扩展内开子进程或独立 SDK session
- **理由**：复用已有会话的 tool 上下文（read、bash 等），接收方 LLM 能以自己的能力回答；不需要额外的 API 调用
- **替代方案**：子进程 RPC 模式（隔离但冷启动慢）；SDK 内嵌 session（需要额外验证可行性，且无法复用主会话的 tool 上下文）

### 心跳间隔：60s，离线判定：2min
- 60s 心跳写入 `lastSeen`，连续 2 次心跳无更新（2min）视为离线
- **理由**：同机器文件写入成本低，60s 间隔足以检测崩溃；2min 窗口容忍网络或系统瞬时卡顿

### 状态模型：二进制
终端要么在交流圈内（可被查询），要么不在。没有"忙"状态。

- **理由**：符合用户需求，简化状态管理

### 默认行为：启动时不在圈内
用户需要主动执行 `/peer-join` 才加入圈。

- **理由**：安全默认，避免用户安装扩展后意外被打扰

## Data Model

```
~/.pi/
├── peers.json              ← 谁在线
│   { "<peer_id>": { "lastSeen": <unix_ms> } }
│
└── mailbox/
    └── {receiver_id}/
        ├── q-{sender}-{ts}.json   ← 查询
        │   { id, from, to, text, timestamp }
        └── a-{sender}-{ts}.json   ← 回答
            { id, from, to, replyTo, text, timestamp }
```

## Architecture

```
pi 进程
  └── 扩展 (peer-network.ts)
        ├── /peer-join     → 写 peers.json + 启心跳
        ├── /peer-quit     → 删 peers.json + 停心跳
        ├── /peer-status   → 读 peers.json → 打印
        ├── 心跳定时器      → 每 60s 更新 lastSeen
        ├── 信箱轮询定时器   → 检查自己的 mailbox 目录
        │     └── 有新查询 → 注入 LLM 会话
        └── 消息截获        → LLM 回答后写回发送方信箱
```

## Data Flow

```
Alice 问 Bob "邮箱是多少？"
  │
  ├── 写入 mailbox/bob/q-alice-{ts}.json
  │
Bob 轮询到 q-alice-{ts}.json
  ├── 注入到 Bob 的 LLM 会话 (steer)
  │   LLM 看到该查询 → 用 read 等工具回答
  └── 截获回答
      └── 写入 mailbox/alice/a-bob-{ts}.json

Alice 轮询到 a-bob-{ts}.json
  └── LLM 看到回答（下一条消息时）
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 多个 pi 进程同时写 peers.json 导致竞态 | 采用 read-merge-write 模式，不做原子锁（同机文件操作竞争概率低） |
| LLM 注入后无法正确识别"这是来自同伴的查询" | 消息使用特殊格式标记，LLM 通过系统提示词了解格式 |
| 轮询延迟导致用户体验不佳 | 轮询间隔设为 1s，对"查信息"场景足够实时 |
| 信箱目录积压大量已处理的文件 | 处理完成后立即删除消息文件 |
| peer_id 冲突 | 使用机器名 + 用户名 + 随机后缀生成默认 ID，用户也可手动指定 |

## Open Questions

（无——所有设计决策在探索阶段已与用户达成一致）
