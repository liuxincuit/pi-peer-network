## ADDED Requirements

### Requirement: 查询写入
peer SHALL 将要发送的查询写入接收方信箱目录，文件名为 `q-{发送者ID}-{Unix时间戳}.json`。
查询文件内容 MUST 包含 `id`、`from`、`to`、`text`、`timestamp` 字段。
查询 MUST 是自包含的，不引用历史消息。

#### Scenario: 发送查询
- **WHEN** peer A 向 peer B 发送查询
- **THEN** mailbox/B/ 目录下出现 `q-A-{ts}.json` 文件，内容包含正确字段

### Requirement: 回答写入
peer SHALL 将接收方的回答写入发送方信箱目录，文件名为 `a-{发送者ID}-{Unix时间戳}.json`。
回答文件 MUST 包含 `replyTo` 字段，引用对应的查询 ID。
回答文件 MUST 包含 `id`、`from`、`to`、`replyTo`、`text`、`timestamp` 字段。

#### Scenario: 回复查询
- **WHEN** 接收方 LLM 对查询做出回答
- **THEN** mailbox/原发送方/ 目录下出现 `a-{原接收方ID}-{ts}.json`，其 `replyTo` 指向查询的 `id`

### Requirement: 信箱轮询
peer SHALL 定期（不超过 1 秒间隔）轮询自己的信箱目录，检查是否有新文件。
peer SHALL 处理完消息文件后将其删除。

#### Scenario: 发现新查询
- **WHEN** 有新文件写入 peer 自己的信箱目录
- **THEN** peer 在下一轮轮询中读取并处理该文件

#### Scenario: 处理后清理
- **WHEN** 查询处理完成且回答已写入发送方信箱
- **THEN** 原始查询文件被删除

### Requirement: 消息格式
查询和回答使用 JSON 格式，MUST NOT 包含 `type`、`error` 等非必要字段。
查询字段：`id`、`from`、`to`、`text`、`timestamp`
回答字段：`id`、`from`、`to`、`replyTo`、`text`、`timestamp`
LLM 的任何输出文本都作为回答内容，不存在"错误答案"的语义。

#### Scenario: 查询文件格式
- **WHEN** 创建查询文件
- **THEN** JSON 内容仅包含 id、from、to、text、timestamp

#### Scenario: 回答文件格式
- **WHEN** 创建回答文件
- **THEN** JSON 内容仅包含 id、from、to、replyTo、text、timestamp
