## ADDED Requirements

### Requirement: 注册与退出
peer SHALL 在执行 `/peer-join` 时将自己注册到 `peers.json`。
peer SHALL 在执行 `/peer-quit` 时将自己从 `peers.json` 中删除。
peer SHALL 在进程退出时自动执行 `/peer-quit` 等效的清理操作。

#### Scenario: 加入交流圈
- **WHEN** 用户执行 `/peer-join`
- **THEN** peers.json 中出现该 peer 的条目，包含 lastSeen 字段

#### Scenario: 退出交流圈
- **WHEN** 用户执行 `/peer-quit`
- **THEN** peers.json 中该 peer 的条目被删除

#### Scenario: 进程退出自动清理
- **WHEN** pi 进程正常退出
- **THEN** peers.json 中该 peer 的条目被删除

### Requirement: 心跳
peer SHALL 在加入交流圈后，每 60 秒更新一次 `peers.json` 中自己的 `lastSeen`。
peer SHALL 在退出交流圈后停止心跳更新。
心跳仅更新 `lastSeen`，不改变其他字段。

#### Scenario: 心跳更新
- **WHEN** peer 加入交流圈已满 60 秒
- **THEN** peers.json 中该 peer 的 lastSeen 被更新为当前时间戳

#### Scenario: 退出后心跳停止
- **WHEN** 用户执行 `/peer-quit`
- **THEN** 心跳定时器停止，peers.json 中不再有该 peer 的记录

### Requirement: 离线判定
peer SHALL 读取 `peers.json` 时，将 `lastSeen` 超过 120 秒的同伴视为离线。

#### Scenario: 同伴在线
- **WHEN** 某 peer 的 lastSeen 距离当前时间不足 120 秒
- **THEN** 该 peer 被判定为在线

#### Scenario: 同伴离线
- **WHEN** 某 peer 的 lastSeen 距离当前时间超过 120 秒
- **THEN** 该 peer 被判定为离线

### Requirement: 同伴列表
peer SHALL 能列出 `peers.json` 中所有同伴及其在线状态。

#### Scenario: 列出同伴
- **WHEN** 查询同伴列表
- **THEN** 返回每个同伴的 ID、在线状态（在线/离线）、lastSeen 时间
