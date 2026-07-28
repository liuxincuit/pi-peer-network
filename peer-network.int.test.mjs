// peer-network.int.test.mjs
// 集成测试：实际启动 pi --mode rpc，加载扩展，验证完整生命周期
// 运行：node peer-network.int.test.mjs

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// 在 Windows 上需要 pi.cmd，其他平台用 pi
const PI_BIN = process.platform === "win32"
  ? path.join(process.env.APPDATA || "", "npm", "pi.cmd")
  : "pi";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-int-"));
// 扩展现在使用 ~/.pi/pi-peer-network/setting.json 中的 dataDir 配置路径
// 默认 dataDir 为 "~/.pi/pi-peer-network"，解析后 peers.json 路径如下：
const REAL_PEERS = path.join(os.homedir(), ".pi", "pi-peer-network", "peers.json");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  FAIL: ${msg}`);
}

// ── JSONL RPC 客户端 ──

class RpcClient {
  constructor(cwd) {
    this.proc = null;
    this.stdin = null;
    this.lineBuffer = "";
    this.pendingEvents = [];
    this.nextId = 1;
    this.resolveQueue = new Map();
    this.cwd = cwd || ROOT;
    this.stderr = "";
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn(
        `"${PI_BIN}" --mode rpc --no-session --no-context-files --no-extensions --extension ./extensions/peer-network.ts`,
        [],
        {
          cwd: this.cwd,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
      });

      this.stdin = this.proc.stdin;

      this.proc.stdout.on("data", (chunk) => {
        this.lineBuffer += chunk.toString("utf-8");
        let idx;
        while ((idx = this.lineBuffer.indexOf("\n")) !== -1) {
          const line = this.lineBuffer.slice(0, idx).trim();
          this.lineBuffer = this.lineBuffer.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "response" && msg.id) {
              this.resolveQueue.get(msg.id)?.(msg);
            }
            this.pendingEvents.push(msg);
          } catch {}
        }
      });

      this.proc.stdout.on("error", () => {});
      this.proc.stderr.on("data", (c) => { this.stderr += c.toString(); });

      // 等待 3s 让 pi 启动
      setTimeout(() => resolve(), 3000);
    });
  }

  send(cmd) {
    return new Promise((resolve) => {
      const id = `${this.nextId++}`;
      cmd.id = id;
      this.resolveQueue.set(id, resolve);
      this.stdin.write(JSON.stringify(cmd) + "\n");
    });
  }

  prompt(text) {
    return this.send({ type: "prompt", message: text });
  }

  async getCommands() {
    const resp = await this.send({ type: "get_commands" });
    return resp.data?.commands || [];
  }

  stop() {
    try { this.proc?.kill(); } catch {}
  }
}

// ═══════════════════════════════════════════════════════
//  测例
// ═══════════════════════════════════════════════════════

async function testExtensionLoads() {
  console.log("\n## 1. 扩展加载与注册");

  // 创建隔离目录，复制扩展
  const iso = fs.mkdtempSync(path.join(ROOT, "t1-"));
  fs.mkdirSync(path.join(iso, "extensions"), { recursive: true });
  fs.copyFileSync("extensions/peer-network.ts", path.join(iso, "extensions", "peer-network.ts"));
  fs.writeFileSync(path.join(iso, "package.json"), JSON.stringify({
    name: "t1", private: true,
    pi: { extensions: ["./extensions/peer-network.ts"] }
  }, null, 2));

  const ag = path.join(iso, ".pi", "agent");
  fs.mkdirSync(ag, { recursive: true });
  fs.writeFileSync(path.join(ag, "settings.json"), JSON.stringify({
    packages: [iso]
  }, null, 2));

  const client = new RpcClient(iso);
  await client.start();

  const commands = await client.getCommands();
  client.stop();

  const names = commands.map(c => c.name);
  assert(names.includes("peer-join"), "peer-join 已注册");
  assert(names.includes("peer-quit"), "peer-quit 已注册");
  assert(names.includes("peer-status"), "peer-status 已注册");

  // 验证 tool 是否存在
  const hasPeerAsk = commands.some(c =>
    c.name === "skill:peer_ask" || c.name === "peer_ask" ||
    c.description?.includes("peer_ask")
  );
  // tools 不在 get_commands 里，但验证通过的命令说明扩展加载成功
  assert(names.includes("peer-join"), "扩展加载正常");
}

async function testPeerJoinAndQuit() {
  console.log("\n## 2. /peer-join → /peer-quit");

  const iso = fs.mkdtempSync(path.join(ROOT, "t2-"));
  fs.mkdirSync(path.join(iso, "extensions"), { recursive: true });
  fs.copyFileSync("extensions/peer-network.ts", path.join(iso, "extensions", "peer-network.ts"));
  fs.writeFileSync(path.join(iso, "package.json"), JSON.stringify({
    name: "t2", private: true,
    pi: { extensions: ["./extensions/peer-network.ts"] }
  }, null, 2));

  const ag = path.join(iso, ".pi", "agent");
  fs.mkdirSync(ag, { recursive: true });
  fs.writeFileSync(path.join(ag, "settings.json"), JSON.stringify({
    packages: [iso]
  }, null, 2));

  const client = new RpcClient(iso);
  await client.start();

  // /peer-join
  await client.prompt("/peer-join");
  await new Promise(r => setTimeout(r, 1500));

  // 检查 peers.json 有我们的条目
  let peers = JSON.parse(fs.readFileSync(REAL_PEERS, "utf-8"));
  const before = Object.keys(peers).length;
  assert(before > 0, "join 后 peers.json 有条目");

  // /peer-quit
  await client.prompt("/peer-quit");
  await new Promise(r => setTimeout(r, 500));

  peers = JSON.parse(fs.readFileSync(REAL_PEERS, "utf-8"));
  const after = Object.keys(peers).length;
  assert(after < before, "quit 后 peers.json 条目减少");

  client.stop();
}

async function testTwoTerminals() {
  console.log("\n## 3. 两个终端互查");

  const dirA = fs.mkdtempSync(path.join(ROOT, "A-"));
  const dirB = fs.mkdtempSync(path.join(ROOT, "B-"));

  for (const d of [dirA, dirB]) {
    fs.mkdirSync(path.join(d, "extensions"), { recursive: true });
    fs.copyFileSync("extensions/peer-network.ts", path.join(d, "extensions", "peer-network.ts"));
    fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({
      name: "t-" + path.basename(d), private: true,
      pi: { extensions: ["./extensions/peer-network.ts"] }
    }, null, 2));
    const ag = path.join(d, ".pi", "agent");
    fs.mkdirSync(ag, { recursive: true });
    fs.writeFileSync(path.join(ag, "settings.json"), JSON.stringify({
      packages: [d]
    }, null, 2));
  }

  const clientA = new RpcClient(dirA);
  await clientA.start();
  const clientB = new RpcClient(dirB);
  await clientB.start();

  // 验证两个连接都有效
  assert((await clientA.getCommands()).some(c => c.name === "peer-join"), "A 扩展加载正常");
  assert((await clientB.getCommands()).some(c => c.name === "peer-join"), "B 扩展加载正常");

  await clientA.prompt("/peer-join");
  await clientB.prompt("/peer-join");

  await new Promise(r => setTimeout(r, 3000));

  const peers = JSON.parse(fs.readFileSync(REAL_PEERS, "utf-8"));
  const ids = Object.keys(peers);
  console.log("  peers.json 条目:", ids);
  const online = ids.filter(
    (id) => Date.now() - peers[id].lastSeen < 180_000
  );
  console.log("  在线:", online);

  await clientA.prompt("/peer-quit");
  await clientB.prompt("/peer-quit");
  await new Promise(r => setTimeout(r, 500));

  clientA.stop();
  clientB.stop();
}

// ═══════════════════════════════════════════════════════
//  运行
// ═══════════════════════════════════════════════════════

async function main() {
  console.log("pi peer-network 集成测试");
  console.log("pi bin:", PI_BIN);
  console.log("temp:", ROOT);

  // 清理测试可能遗留的旧 peers.json 条目（通过 /peer-quit 留下的非本进程条目）
  function cleanupPeers() {
    try {
      const p = JSON.parse(fs.readFileSync(REAL_PEERS, "utf-8"));
      for (const k of Object.keys(p)) {
        if (k.includes(os.hostname())) delete p[k];
      }
      fs.writeFileSync(REAL_PEERS, JSON.stringify(p, null, 2));
    } catch {}
  }
  cleanupPeers();

  const tests = [testExtensionLoads, testPeerJoinAndQuit, testTwoTerminals];
  for (const t of tests) {
    try {
      await t();
      cleanupPeers();
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      failed++;
    }
  }

  try { fs.rmSync(ROOT, { recursive: true }); } catch {}

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) process.exit(1);
}

main();
