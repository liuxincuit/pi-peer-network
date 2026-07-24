## ADDED Requirements

### Requirement: /peer-join 命令
`/peer-join` SHALL 将当前终端的 ID 写入 `peers.json`。
`/peer-join` SHALL 启动心跳定时器（每 60 秒更新 lastSeen）。
`/peer-join` SHALL 启动信箱轮询定时器。
`/peer-join` SHALL 通知用户已加入交流圈。
如果该终端已在交流圈中，SHALL 提示用户当前状态并忽略重复操作。

#### Scenario: 加入圈
- **WHEN** 用户输入 `/peer-join`
- **THEN** 终端写入 peers.json，启动心跳和轮询，显示已加入的消息

#### Scenario: 重复加入
- **WHEN** 用户已加入圈，再次输入 `/peer-join`
- **THEN** 提示已在交流圈中，不执行任何操作

### Requirement: /peer-quit 命令
`/peer-quit` SHALL 从 `peers.json` 中删除当前终端的记录。
`/peer-quit` SHALL 停止心跳定时器。
`/peer-quit` SHALL 停止信箱轮询定时器。
`/peer-quit` SHALL 通知用户已退出交流圈。
如果该终端不在交流圈中，SHALL 提示用户当前状态并忽略操作。

#### Scenario: 退出圈
- **WHEN** 用户输入 `/peer-quit`
- **THEN** 终端从 peers.json 删除自己，停止心跳和轮询，显示已退出的消息

#### Scenario: 未加入就退出
- **WHEN** 用户不在交流圈中，输入 `/peer-quit`
- **THEN** 提示不在交流圈中，不执行任何操作

### Requirement: /peer-status 命令
`/peer-status` SHALL 读取 `peers.json` 的所有条目。
`/peer-status` SHALL 根据 `lastSeen` 标注每个同伴的在线状态（在线/离线）。
`/peer-status` SHALL 显示自己的状态（在圈/不在圈）。
`/peer-status` SHALL 显示每个同伴的上次活跃时间。

#### Scenario: 查看状态
- **WHEN** 用户输入 `/peer-status`
- **THEN** 显示自己和所有同伴的 ID、在线状态、lastSeen

#### Scenario: 无同伴
- **WHEN** 用户输入 `/peer-status`，但 peers.json 中只有自己或为空
- **THEN** 显示提示信息，说明当前没有其他在线同伴
