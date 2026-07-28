## Context

插件当前使用硬编码路径 `~/.pi/peers.json` 和 `~/.pi/mailbox/` 存储数据，直接污染了 pi 自身的配置目录 `~/.pi/`。

本变更将插件数据迁移到独立的 `~/.pi/pi-peer-network/` 目录下，并通过 `setting.json` 提供 `dataDir` 配置项，支持用户自定义数据存放位置。

## Goals / Non-Goals

**Goals:**
- 消除对 `~/.pi/` 根目录的污染，所有插件数据存放在独立目录
- 提供 `setting.json` 配置文件，包含 `dataDir` 字段
- 扩展初始化时自动生成默认配置
- 支持 `dataDir` 路径解析：绝对路径、`~` 开头、相对路径三种模式

**Non-Goals:**
- 不支持存量数据迁移，用户需重新执行 `/peer-join`
- 不提供 `setting.json` 路径的自定义（固定为 `~/.pi/pi-peer-network/setting.json`）
- 不修改 peer-discovery、peer-messaging 等能力的逻辑行为

## Decisions

### 配置文件位置：固定路径不可自定义
选择 `~/.pi/pi-peer-network/setting.json` 作为固定配置路径。
- **理由**：配置文件位置固定简化了发现逻辑，避免"配置文件在哪"的递归问题；默认目录名与插件名一致，易于识别
- **替代方案**：允许自定义 setting.json 路径 → 增加复杂度且无实际收益

### dataDir 默认值：与基础目录一致
`dataDir` 默认值为 `"~/.pi/pi-peer-network"`。
- **理由**：数据默认放在基础目录下，符合直觉；用户无需额外配置即可正常工作
- **替代方案**：默认值设为空或 `./data` → 需要额外解析逻辑，不够直观

### 路径解析优先级
1. `path.isAbsolute(dataDir)` → 直接使用（如 `/data/pi` 或 `C:\data\pi`）
2. 以 `~` 开头 → `path.join(os.homedir(), dataDir.slice(1))`
3. 其他 → `path.join("~/.pi/pi-peer-network", dataDir)`

- **理由**：绝对路径最明确优先；`~` 开头的路径是用户主目录的常见表达；相对路径相对于基础目录是最安全的兜底
- **替代方案**：所有路径相对 CWD 解析 → 不可靠，扩展的工作目录不确定

### 配置自动生成时机
扩展加载时（`export default function` 执行时）检测 `setting.json` 是否存在，不存在则用默认值创建。
- **理由**：保证扩展在任何命令执行前已有有效配置；无需用户手动操作
- **替代方案**：`/peer-join` 时生成 → 前置依赖增加心智负担；setup 脚本 → 多一个步骤

### 存量数据不迁移
用户需重新执行 `/peer-join`，旧 `peers.json` 和 `mailbox/` 被忽略。
- **理由**：peer 机制的数据是瞬态的（lastSeen、待处理消息），迁移无意义；减少变更风险
- **替代方案**：检测旧文件并复制 → 增加复杂度，且心跳信息已过期

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 用户升级后忘记重新 `/peer-join`，以为插件不工作 | 在 `/peer-status` 中如果检测到不在圈内且旧数据存在，提示用户重新 join |
| setting.json 文件损坏导致解析失败 | 解析失败时回退到默认值，并尝试用默认值重写配置 |
| dataDir 目录无写入权限 | 初始化时检测写入权限，失败时向用户报告错误 |
| 路径含不可见字符或尾随空格 | 读取配置后做 trim；路径解析使用 `path` 模块规范化 |
