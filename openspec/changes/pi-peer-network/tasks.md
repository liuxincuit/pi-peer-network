## 1. 项目初始化

- [x] 1.1 在 `.pi/extensions/` 下创建 `peer-network.ts` 扩展文件骨架（export default function）
- [x] 1.2 定义扩展用到的常量和配置（peers.json 路径、mailbox 路径、心跳间隔、轮询间隔、离线超时）

## 2. 数据层：peers.json 读写

- [x] 2.1 实现 `readPeers()` — 从 `~/.pi/peers.json` 读取并解析 JSON
- [x] 2.2 实现 `writePeers(data)` — 写回 peers.json（read-modify-write 模式避免覆盖）
- [x] 2.3 实现 `peerJoin()` — 将自身 ID 写入 peers.json 并更新 lastSeen
- [x] 2.4 实现 `peerQuit()` — 从 peers.json 中删除自身
- [x] 2.5 实现心跳定时器（每 60 秒更新 lastSeen），以及停止心跳的函数
- [x] 2.6 实现 getPeersStatus() — 读取 peers.json 并根据 lastSeen 判定在线/离线

## 3. 命令层：/peer-join / /peer-quit / /peer-status

- [x] 3.1 实现 `pi.registerCommand('peer-join', ...)` — 调用 peerJoin + 启动心跳 + 启动轮询
- [x] 3.2 实现 `pi.registerCommand('peer-quit', ...)` — 调用 peerQuit + 停止心跳 + 停止轮询
- [x] 3.3 实现 `pi.registerCommand('peer-status', ...)` — 显示自己和同伴的状态表格
- [x] 3.4 注册进程退出钩子（process.on('exit', ...)），自动执行 peerQuit 清理

## 4. 数据层：信箱（mailbox）读写

- [x] 4.1 实现 `sendQuery(targetPeer, text)` — 写入 `{to}/q-{from}-{ts}.json`
- [x] 4.2 实现 `writeAnswer(targetPeer, replyToId, text)` — 写入 `{to}/a-{from}-{ts}.json`
- [x] 4.3 实现 `pollMailbox()` — 扫描自己的信箱目录，返回新文件列表
- [x] 4.4 实现 `removeMessage(filePath)` — 处理完毕后删除消息文件
- [x] 4.5 实现 `registerPeerAskTool()` — 注册 `peer_ask(peer, question)` tool，供 LLM 调用
- [x] 4.6 实现 `registerPeerListTool()` — 注册 `peer_list()` tool，供 LLM 调用

## 5. 查询处理：注入与截获

- [x] 5.1 轮询到新查询时，将查询文本格式化为系统消息
- [x] 5.2 使用 pi 的 sendUserMessage 将查询注入当前 LLM 会话
- [x] 5.3 监听 agent_end 事件，截获 LLM 对查询的回答
- [x] 5.4 将截获的回答通过 writeAnswer 写回发送方信箱
- [x] 5.5 删除已处理的查询文件
- [x] 5.6 每次注入的查询是独立的消息，不携带上文

## 6. 集成测试

- [x] 6.0 编写自动化测试脚本 `peer-network.test.js`（覆盖文件协议 34 项）
- [x] 6.1 编写集成测试 `peer-network.int.test.mjs`（覆盖实际 pi 加载 8 项）
- [x] 6.2 双终端 peers.json 正确注册（不同 peerId 互不覆盖）
- [x] 6.3 退出后 peers.json 清空
- [x] 6.4 扩展加载、命令注册验证

### 运行方式

```bash
npm test        # 文件协议测试 (34项)
npm run test:int  # 集成测试 (8项)
npm run test:all  # 全部 (42项)
```
