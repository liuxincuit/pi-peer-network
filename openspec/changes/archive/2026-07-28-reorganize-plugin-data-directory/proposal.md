## Why

插件当前在 `~/.pi/` 下直接创建 `peers.json` 和 `mailbox/`，污染了 `~/.pi` 根目录。`~/.pi/` 是 pi 自身的数据目录，第三方扩展的数据应存放在独立的子目录下，避免命名冲突和目录混乱。

## What Changes

- 新增 `~/.pi/pi-peer-network/` 作为插件的基础目录
- 新增 `~/.pi/pi-peer-network/setting.json` 配置文件，固定路径不可自定义
- `setting.json` 包含 `dataDir` 字段，指定数据存放目录
- 默认配置：`{ "dataDir": "~/.pi/pi-peer-network" }`
- 扩展初始化时自动生成默认配置
- 修改现有代码中的常量，从硬编码路径改为通过配置读取
- **BREAKING**: 不迁移存量数据，用户需重新执行 `/peer-join` 加入交流圈
- `dataDir` 路径解析规则：
  1. `path.isAbsolute(dataDir)` → 直接使用（跨平台，Windows `C:\...` 和 Unix `/...` 均可）
  2. 以 `~` 开头 → 替换为 `os.homedir()`
  3. 其他 → 相对于 `~/.pi/pi-peer-network/` 解析

## Capabilities

### New Capabilities
- `data-config`: 插件配置管理，包括 setting.json 的自动生成、读取与 dataDir 路径解析

### Modified Capabilities

（无，peer-discovery、peer-messaging、peer-commands、peer-query-injection 的功能不变，仅数据存储位置改为由配置决定）

## Impact

- 修改 `extensions/peer-network.ts`：路径常量改为从配置读取，新增配置管理逻辑
- 修改 `peer-network.int.test.mjs`：集成测试中硬编码的 `~/.pi/peers.json` 需要改为通过 setting.json 读取
- `peer-network.test.js` 使用临时目录，不受影响
- `package.json`、`README.md` 暂无变更必要
