// peer-network.test.js
// 自动化集成测试：模拟两个终端的文件级交互
// 运行：node peer-network.test.js

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── 测试隔离：用临时目录 ──

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-test-"));
const PEERS = path.join(ROOT, "peers.json");
const MAILBOX = path.join(ROOT, "mailbox");

function resetEnv() {
  try { fs.rmSync(ROOT, { recursive: true }); } catch {}
  fs.mkdirSync(MAILBOX, { recursive: true });
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  FAIL: ${msg}`);
}

// ── 辅助：模拟终端操作 ──

function readPeers() {
  try { return JSON.parse(fs.readFileSync(PEERS, "utf-8")); } catch { return {}; }
}

function writePeers(data) {
  const existing = readPeers();
  fs.writeFileSync(PEERS, JSON.stringify({ ...existing, ...data }, null, 2));
}

function peerJoin(id) {
  writePeers({ [id]: { lastSeen: Date.now() } });
}

function peerQuit(id) {
  const data = readPeers();
  delete data[id];
  fs.writeFileSync(PEERS, JSON.stringify(data, null, 2));
}

function updateHeartbeat(id) {
  const data = readPeers();
  if (data[id]) {
    data[id].lastSeen = Date.now();
    fs.writeFileSync(PEERS, JSON.stringify(data, null, 2));
  }
}

function isOnline(id, peers, now, timeoutMs) {
  const p = peers[id];
  if (!p) return false;
  return now - p.lastSeen < timeoutMs;
}

function sendQuery(fromId, toId, text) {
  const dir = path.join(MAILBOX, toId);
  fs.mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  const id = `q-${fromId}-${ts}`;
  fs.writeFileSync(
    path.join(dir, `q-${fromId}-${ts}.json`),
    JSON.stringify({ id, from: fromId, to: toId, text, timestamp: ts }, null, 2),
  );
  return id;
}

function writeAnswer(fromId, toId, replyToId, text) {
  const dir = path.join(MAILBOX, toId);
  fs.mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  fs.writeFileSync(
    path.join(dir, `a-${fromId}-${ts}.json`),
    JSON.stringify({
      id: `a-${fromId}-${ts}`, from: fromId, to: toId,
      replyTo: replyToId, text, timestamp: ts,
    }, null, 2),
  );
}

function pollMailbox(id) {
  const dir = path.join(MAILBOX, id);
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter(f => f.startsWith("q-") && f.endsWith(".json"))
    .map(f => {
      try {
        return { file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) };
      } catch { return null; }
    })
    .filter(Boolean);
}

function pollAnswers(id) {
  const dir = path.join(MAILBOX, id);
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter(f => f.startsWith("a-") && f.endsWith(".json"))
    .map(f => {
      try {
        return { file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) };
      } catch { return null; }
    })
    .filter(Boolean);
}

function getPeersStatus(myId, timeoutMs) {
  const data = readPeers();
  const now = Date.now();
  return Object.entries(data)
    .filter(([id]) => id !== myId)
    .map(([id, info]) => ({ id, online: now - info.lastSeen < timeoutMs, lastSeen: info.lastSeen }));
}

// ═══════════════════════════════════════════════════════
//  测例
// ═══════════════════════════════════════════════════════

function testPeersBasic() {
  console.log("\n## 1. peers.json 基础操作");
  resetEnv();

  peerJoin("A");
  assert(readPeers()["A"]?.lastSeen > 0, "加入 A 后 peers.json 有 A 的条目");

  peerJoin("B");
  const peers = readPeers();
  assert(!!peers["A"], "加入 B 后 A 仍在");
  assert(!!peers["B"], "加入 B 后 B 存在");

  peerQuit("A");
  const afterQuit = readPeers();
  assert(!afterQuit["A"], "退出 A 后 A 被删除");
  assert(!!afterQuit["B"], "退出 A 后 B 不受影响");

  peerQuit("B");
  assert(Object.keys(readPeers()).length === 0, "全部退出后 peers.json 为空");
}

function testHeartbeatAndOffline() {
  console.log("\n## 2. 心跳与离线判定");
  resetEnv();

  const timeout = 120_000; // 2 分钟
  const now = Date.now();

  // 模拟加入和心跳
  peerJoin("A");
  updateHeartbeat("A");

  let peers = readPeers();
  assert(isOnline("A", peers, now, timeout), "有心跳时判定在线");

  // 模拟 3 分钟前的心跳（超时）
  const stale = now - 180_000;
  fs.writeFileSync(PEERS, JSON.stringify({ A: { lastSeen: stale } }, null, 2));
  peers = readPeers();
  assert(!isOnline("A", peers, now, timeout), "lastSeen 超 2 分钟后判离线");

  // 空的
  peerQuit("A");
  peers = readPeers();
  assert(!isOnline("A", peers, now, timeout), "不存在的终端判离线");
}

function testMessageFormat() {
  console.log("\n## 3. 消息格式");
  resetEnv();

  const qid = sendQuery("alice", "bob", "邮箱是多少？");
  const queryFile = path.join(MAILBOX, "bob", fs.readdirSync(path.join(MAILBOX, "bob"))[0]);
  const query = JSON.parse(fs.readFileSync(queryFile, "utf-8"));

  assert(query.id === qid, "查询包含 id");
  assert(query.from === "alice", "查询包含 from");
  assert(query.to === "bob", "查询包含 to");
  assert(query.text === "邮箱是多少？", "查询包含 text");
  assert(typeof query.timestamp === "number", "查询包含 timestamp");
  assert(!query.type, "查询不包含 type 字段");
  assert(!query.error, "查询不包含 error 字段");

  writeAnswer("bob", "alice", qid, "alice@example.com");
  const answerFile = path.join(MAILBOX, "alice", fs.readdirSync(path.join(MAILBOX, "alice"))[0]);
  const answer = JSON.parse(fs.readFileSync(answerFile, "utf-8"));

  assert(answer.replyTo === qid, "回答包含 replyTo");
  assert(answer.text === "alice@example.com", "回答包含 text");
  assert(!answer.type, "回答不包含 type");
  assert(!answer.error, "回答不包含 error");
}

function testMailboxPoll() {
  console.log("\n## 4. 信箱轮询");
  resetEnv();

  // Alice 向 Bob 发查询
  sendQuery("alice", "bob", "你好？");
  const queries = pollMailbox("bob");
  assert(queries.length === 1, "Bob 轮询到 1 条新查询");
  assert(queries[0].from === "alice", "查询来自 alice");
  assert(queries[0].text === "你好？", "查询内容正确");

  // Bob 回答
  writeAnswer("bob", "alice", queries[0].id, "你好！");
  const answers = pollAnswers("alice");
  assert(answers.length === 1, "Alice 轮询到 1 条回答");
  assert(answers[0].text === "你好！", "回答内容正确");
  assert(answers[0].replyTo === queries[0].id, "回答关联正确");
}

function testEndToEnd() {
  console.log("\n## 5. 端到端流程");
  resetEnv();

  // 5.1 两个终端加入
  peerJoin("PC1-sess-a");
  peerJoin("PC2-sess-b");
  let status = getPeersStatus("PC1-sess-a", 120_000);
  assert(status.some(s => s.id === "PC2-sess-b" && s.online), "A 看到 B 在线");
  status = getPeersStatus("PC2-sess-b", 120_000);
  assert(status.some(s => s.id === "PC1-sess-a" && s.online), "B 看到 A 在线");

  // 5.2 A 问 B，B 回答
  const qid = sendQuery("PC1-sess-a", "PC2-sess-b", "你是什么终端？");
  const bobQueries = pollMailbox("PC2-sess-b");
  assert(bobQueries.length === 1, "B 收到 A 的查询");
  assert(bobQueries[0].text === "你是什么终端？", "B 看到查询内容");

  writeAnswer("PC2-sess-b", "PC1-sess-a", qid, "我是终端 B");
  const aliceAnswers = pollAnswers("PC1-sess-a");
  assert(aliceAnswers.length === 1, "A 收到 B 的回答");
  assert(aliceAnswers[0].text === "我是终端 B", "A 看到回答内容");

  // 5.3 B 退出
  peerQuit("PC2-sess-b");
  status = getPeersStatus("PC1-sess-a", 120_000);
  assert(!status.some(s => s.id === "PC2-sess-b"), "A 看不到已退出的 B");

  // 5.4 退出后不可查询
  const peersAfterQuit = readPeers();
  const online = isOnline("PC2-sess-b", peersAfterQuit, Date.now(), 120_000);
  assert(!online, "B 退出后判离线");
}

// ═══════════════════════════════════════════════════════
//  运行
// ═══════════════════════════════════════════════════════

testPeersBasic();
testHeartbeatAndOffline();
testMessageFormat();
testMailboxPoll();
testEndToEnd();

// 清理
try { fs.rmSync(ROOT, { recursive: true }); } catch {}

console.log(`\n══════════════════════════════`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
