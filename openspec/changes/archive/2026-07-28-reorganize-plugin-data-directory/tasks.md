## 1. 配置管理模块

- [x] 1.1 定义配置常量：`BASE_DIR = path.join(os.homedir(), ".pi", "pi-peer-network")`、`SETTING_FILE = path.join(BASE_DIR, "setting.json")`
- [x] 1.2 实现 `loadConfig()` — 读取 `setting.json`，不存在时用默认值自动创建；解析失败时回退到默认值并重写
- [x] 1.3 实现 `resolveDataDir(config)` — 根据 `dataDir` 按路径解析规则（绝对路径、~ 开头、相对路径）返回实际路径
- [x] 1.4 在扩展初始化时调用 `loadConfig()` 加载配置，将解析后的 `dataDir` 存为全局状态

## 2. 迁移路径常量为配置驱动

- [x] 2.1 将 `PEERS_FILE` 从 `path.join(PI_DIR, "peers.json")` 改为 `path.join(resolvedDataDir, "peers.json")`
- [x] 2.2 将 `MAILBOX_DIR` 从 `path.join(PI_DIR, "mailbox")` 改为 `path.join(resolvedDataDir, "mailbox")`
- [x] 2.3 删除不再使用的 `PI_DIR` 常量

## 3. 更新集成测试

- [x] 3.1 将 `peer-network.int.test.mjs` 中的 `REAL_PEERS` 引用改为通过 dataDir 派生路径
- [x] 3.2 验证集成测试在新的数据目录结构下正常运行
- [x] 3.3 确认 `peer-network.test.js` 使用临时目录，不受本次变更影响
- [x] 3.4 修复集成测试扩展加载方式：改用 `--no-extensions --extension` 确保隔离性

## 4. 验证

- [x] 4.1 运行 `npm run test:all` 确认全部测试通过（51/51）
- [x] 4.2 确认扩展初始化时自动生成 `~/.pi/pi-peer-network/setting.json`
- [x] 4.3 确认 `/peer-join` 和 `/peer-quit` 操作在配置的 dataDir 下正常工作
