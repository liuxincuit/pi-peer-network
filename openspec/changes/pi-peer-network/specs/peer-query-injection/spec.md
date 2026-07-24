## ADDED Requirements

### Requirement: 查询注入
peer SHALL 在轮询到新查询时，将查询内容作为一条消息注入到当前活跃的 LLM 会话。
注入 SHALL 发生在当前 LLM turn 完成后（使用 pi 的消息队列机制），不打断正在进行的处理。
注入的消息 SHALL 包含足够的信息让 LLM 知道这是一条来自同伴的查询，以及查询的文本内容。

#### Scenario: 收到查询并注入
- **WHEN** 信箱目录出现新的查询文件，且当前 LLM 正在处理中
- **THEN** 查询在当前 turn 完成后注入会话，LLM 看到该查询

#### Scenario: 空闲时收到查询
- **WHEN** 信箱目录出现新的查询文件，且当前 LLM 处于空闲状态
- **THEN** 查询立即注入会话，LLM 处理该查询

### Requirement: LLM 使用已有工具回答
LLM SHALL 使用当前会话中已有 tool（如 read、bash、grep 等）来回答查询。
注入的查询 SHOULD NOT 提供额外的临时 tool。

#### Scenario: 读取文件回答
- **WHEN** 查询要求查找个人信息
- **THEN** LLM 使用 read 工具读取相关信息文件，从中提取答案

### Requirement: 回答截获与回复
扩展 SHALL 截获 LLM 对查询的回答。
扩展 SHALL 将截获的回答写入发送方的信箱目录，文件格式遵循 peer-messaging 规范。
扩展 SHALL 在写入回答后从接收方信箱目录删除原始查询文件。

#### Scenario: 自动回复
- **WHEN** LLM 产生了对查询的回答
- **THEN** 扩展自动将该回答写入 mailbox/发送方/，并删除查询文件

### Requirement: 无上下文延续
每次查询注入时，SHALL NOT 附带之前的查询或回答历史。
LLM SHOULD 将每条查询视为独立的问题。

#### Scenario: 独立查询
- **WHEN** 同伴先后两次发送不同查询
- **THEN** 每次注入的查询都不携带对方上一次的查询或回答内容
