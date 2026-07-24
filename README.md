# pi-peer-network

pi 扩展，让多个 pi 终端能互相查询信息。

## 安装

先把 `D:/code/temp` 加入全局 settings.json 的 `packages` 列表：

```json
// ~/.pi/agent/settings.json
{
  "packages": [
    "D:/code/temp"
  ]
}
```

启动 pi 后扩展自动加载。

## 使用

```bash
# 加入交流圈，接受其他终端的查询
/peer-join

# 查看所有同伴的在线状态
/peer-status

# 退出交流圈
/peer-quit
```

LLM 还可以调用 `peer_ask` 和 `peer_list` 工具向同伴提问。

## 原理

每个终端读写 `~/.pi/peers.json` 发现彼此，通过 `~/.pi/mailbox/` 下的文件交换查询和回答，接收方用 LLM 回答。

## 测试

```bash
npm test          # 文件协议测试 (34项)
npm run test:int  # 集成测试 (8项，需 pi CLI)
npm run test:all  # 全部 (42项)
```
