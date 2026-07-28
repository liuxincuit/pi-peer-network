# Data Config

插件的配置管理能力，包括 setting.json 的自动生成、dataDir 路径解析与使用。

## Requirements

### Requirement: 配置文件自动生成
系统 SHALL 在扩展初始化时检测 `~/.pi/pi-peer-network/setting.json` 是否存在。
- 若不存在，SHALL 使用默认配置 `{ "dataDir": "~/.pi/pi-peer-network" }` 自动创建该文件
- 若配置目录不存在，SHALL 先创建目录再写入

#### Scenario: 首次加载时生成默认配置
- **WHEN** 扩展首次加载且 `~/.pi/pi-peer-network/setting.json` 不存在
- **THEN** 系统自动创建该文件，内容为 `{ "dataDir": "~/.pi/pi-peer-network" }`

#### Scenario: 配置已存在时不覆写
- **WHEN** 扩展加载且 `~/.pi/pi-peer-network/setting.json` 已存在
- **THEN** 系统直接读取现有配置，不修改文件内容

### Requirement: 读取配置
系统 MUST 从 `~/.pi/pi-peer-network/setting.json` 读取 `dataDir` 字段作为数据存放目录。

#### Scenario: 正常读取配置
- **WHEN** setting.json 存在且有效，包含 `{ "dataDir": "/custom/path" }`
- **THEN** 系统使用 `/custom/path` 作为数据目录

#### Scenario: 配置文件损坏
- **WHEN** setting.json 存在但 JSON 解析失败
- **THEN** 系统 SHALL 回退到默认值 `"~/.pi/pi-peer-network"`，并尝试用默认值重写配置文件

### Requirement: dataDir 路径解析
系统 MUST 按以下优先级解析 `dataDir`：
1. `path.isAbsolute(dataDir)` → 直接使用（跨平台，Windows `C:\...` 和 Unix `/...` 均可）
2. 以 `~` 开头 → 替换为 `os.homedir()`
3. 其他 → 相对于 `~/.pi/pi-peer-network/` 解析

#### Scenario: 绝对路径
- **WHEN** `dataDir` 为 `"/data/pi"`（Unix）或 `"C:\data\pi"`（Windows）
- **THEN** 系统直接使用该路径作为数据目录

#### Scenario: 以 ~ 开头的路径
- **WHEN** `dataDir` 为 `"~/custom/pi-data"`
- **THEN** 系统将 `~` 替换为 `os.homedir()`，使用 `path.join(os.homedir(), "custom/pi-data")`

#### Scenario: 相对路径
- **WHEN** `dataDir` 为 `"custom/data"`
- **THEN** 系统相对于 `~/.pi/pi-peer-network/` 解析，使用 `~/.pi/pi-peer-network/custom/data`

### Requirement: 使用 dataDir 替代硬编码路径
系统中的所有数据文件路径 SHALL 从配置的 `dataDir` 派生，取代原有的硬编码 `~/.pi/peers.json` 和 `~/.pi/mailbox/`。

具体映射：
| 旧路径 | 新路径 |
|--------|--------|
| `~/.pi/peers.json` | `{dataDir}/peers.json` |
| `~/.pi/mailbox/` | `{dataDir}/mailbox/` |

#### Scenario: peers.json 使用 dataDir
- **WHEN** `dataDir` 被配置为 `"/custom/path"`
- **THEN** `peers.json` 的路径为 `"/custom/path/peers.json"`

#### Scenario: mailbox 使用 dataDir
- **WHEN** `dataDir` 被配置为 `"/custom/path"`
- **THEN** mailbox 目录的路径为 `"/custom/path/mailbox"`

### Requirement: 数据目录自动创建
系统 MUST 在第一次使用数据目录（如读写 peers.json 或 mailbox）时确保目录存在。

#### Scenario: dataDir 首次写入
- **WHEN** 系统准备首次写入 `{dataDir}/peers.json`
- **THEN** 系统自动创建 `{dataDir}` 目录（含父目录）
