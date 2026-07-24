## Why

多个 pi 终端之间缺乏一种平等的、点对点的信息查询机制。当用户在不同目录下启动多个 pi 终端时，它们各自拥有独立的文件上下文，无法相互查询信息。例如，终端 A 所在目录存有个人信息文件，终端 B 想知道其中的内容时必须直接访问该目录，而不是向 A 询问。

## What Changes

- 新增一个 pi 扩展（TypeScript extension），实现终端间的点对点通信
- 新增 `peers.json` 共享文件，记录在线的同伴终端
- 新增信箱目录 `mailbox/{peer_id}/`，用共享文件轮询的方式交换消息
- 新增三个 `/peer-` 命令：`/peer-join`、`/peer-quit`、`/peer-status`
- 新增持久心跳机制，定期更新 lastSeen，以便同伴检测离线
- 新增接收方 LLM 处理机制：轮询到查询后注入当前会话，由 LLM 回答

## Capabilities

### New Capabilities
- `peer-discovery`: 基于共享文件 peers.json 的对等发现机制，包含心跳和离线检测
- `peer-messaging`: 基于信箱目录的异步消息交换，使用文件轮询传输查询和回答
- `peer-commands`: pi 扩展命令 `/peer-join`、`/peer-quit`、`/peer-status`，控制终端的交流圈状态
- `peer-query-injection`: 将收到的查询注入当前 LLM 会话，由 LLM 自主决定如何回答

### Modified Capabilities

（无，这是一个新项目，没有已有 specs）

## Impact

- 新增 `~/.pi/peers.json` 共享文件
- 新增 `~/.pi/mailbox/` 目录结构
- 新增一个 pi 扩展文件，需要用户安装到 `.pi/extensions/` 或全局扩展目录
- 新增 `.pi/settings.json` 中可选配置项（心跳间隔等）
