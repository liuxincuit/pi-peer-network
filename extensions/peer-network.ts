import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── 配置常量 ──────────────────────────────────────────

const BASE_DIR = path.join(os.homedir(), ".pi", "pi-peer-network");
const SETTING_FILE = path.join(BASE_DIR, "setting.json");

const DEFAULT_SETTING = { dataDir: "~/.pi/pi-peer-network" };

let _configDataDir = ""; // 解析后的 dataDir，扩展初始化时设置

let PEERS_FILE = "";
let MAILBOX_DIR = "";

const HEARTBEAT_MS = 60_000; // 60 秒心跳
const POLL_MS = 1_000; // 1 秒轮询信箱
const OFFLINE_MS = 120_000; // 2 分钟无心跳判离线
const PEER_TIMEOUT_MS = 30_000; // peer_ask 等待回答超时

// ═══════════════════════════════════════════════════════
//  配置管理
// ═══════════════════════════════════════════════════════

function loadConfig(): { dataDir: string } {
  try {
    const raw = fs.readFileSync(SETTING_FILE, "utf-8");
    const cfg = JSON.parse(raw);
    if (typeof cfg.dataDir === "string") return { dataDir: cfg.dataDir };
    // dataDir 字段缺失或非字符串，用默认值
    fs.writeFileSync(SETTING_FILE, JSON.stringify(DEFAULT_SETTING, null, 2), "utf-8");
    return { ...DEFAULT_SETTING };
  } catch {
    // 文件不存在或解析失败，创建默认配置
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.writeFileSync(SETTING_FILE, JSON.stringify(DEFAULT_SETTING, null, 2), "utf-8");
    return { ...DEFAULT_SETTING };
  }
}

function resolveDataDir(config: { dataDir: string }): string {
  const dir = config.dataDir;
  if (path.isAbsolute(dir)) return dir;
  if (dir.startsWith("~")) return path.join(os.homedir(), dir.slice(1));
  return path.join(BASE_DIR, dir);
}

// ── 全局状态（在 default export 中初始化）───────────────

let _pi: ExtensionAPI;
let _peerId = "";
let _inCircle = false;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

/** 正在等待截获的 peer 查询 */
let _pendingReply: {
  from: string;
  queryId: string;
  queryFilePath: string;
} | null = null;

// ═══════════════════════════════════════════════════════
//  数据层：peers.json
// ═══════════════════════════════════════════════════════

function readPeers(): Record<string, { lastSeen: number }> {
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writePeers(data: Record<string, { lastSeen: number }>): void {
  fs.mkdirSync(path.dirname(PEERS_FILE), { recursive: true });
  // read-modify-write：先读现内容再合并，避免覆盖其他进程的写入
  let existing: Record<string, { lastSeen: number }> = {};
  try {
    existing = JSON.parse(fs.readFileSync(PEERS_FILE, "utf-8"));
  } catch {
    // 文件不存在或解析失败
  }
  fs.writeFileSync(PEERS_FILE, JSON.stringify({ ...existing, ...data }, null, 2), "utf-8");
}

function peerJoin(): void {
  writePeers({ [_peerId]: { lastSeen: Date.now() } });
  _inCircle = true;
}

function peerQuit(): void {
  const data = readPeers();
  delete data[_peerId];
  fs.writeFileSync(PEERS_FILE, JSON.stringify(data, null, 2), "utf-8");
  _inCircle = false;
}

function updateHeartbeat(): void {
  if (!_inCircle) return;
  const data = readPeers();
  if (data[_peerId]) {
    data[_peerId].lastSeen = Date.now();
    writePeers(data);
  }
}

function getPeersStatus(): Array<{ id: string; online: boolean; lastSeen: number }> {
  const data = readPeers();
  const now = Date.now();
  const result: Array<{ id: string; online: boolean; lastSeen: number }> = [];
  for (const [id, info] of Object.entries(data)) {
    if (id === _peerId) continue;
    result.push({
      id,
      online: now - info.lastSeen < OFFLINE_MS,
      lastSeen: info.lastSeen,
    });
  }
  return result;
}

function isPeerOnline(targetId: string): boolean {
  const data = readPeers();
  const peer = data[targetId];
  if (!peer) return false;
  return Date.now() - peer.lastSeen < OFFLINE_MS;
}

// ═══════════════════════════════════════════════════════
//  数据层：信箱 (mailbox)
// ═══════════════════════════════════════════════════════

function mailboxDir(targetPeer: string): string {
  return path.join(MAILBOX_DIR, targetPeer);
}

/** 写入一条查询到接收方信箱 */
function sendQuery(targetPeer: string, text: string): string {
  const dir = mailboxDir(targetPeer);
  fs.mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  const id = `q-${_peerId}-${ts}`;
  const query = { id, from: _peerId, to: targetPeer, text, timestamp: ts };
  fs.writeFileSync(path.join(dir, `q-${_peerId}-${ts}.json`), JSON.stringify(query, null, 2), "utf-8");
  return id;
}

/** 写入一条回答到发送方信箱 */
function writeAnswer(targetPeer: string, replyToId: string, text: string): void {
  const dir = mailboxDir(targetPeer);
  fs.mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  const answer = {
    id: `a-${_peerId}-${ts}`,
    from: _peerId,
    to: targetPeer,
    replyTo: replyToId,
    text,
    timestamp: ts,
  };
  fs.writeFileSync(path.join(dir, `a-${_peerId}-${ts}.json`), JSON.stringify(answer, null, 2), "utf-8");
}

/** 扫描自己信箱中的查询文件 */
function pollMailbox(): Array<{ file: string; id: string; from: string; text: string }> {
  const dir = mailboxDir(_peerId);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const queries: Array<{ file: string; id: string; from: string; text: string }> = [];
  for (const file of files) {
    if (!file.startsWith("q-") || !file.endsWith(".json")) continue;
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (content.from && content.text) {
        queries.push({ file, id: content.id, from: content.from, text: content.text });
      }
    } catch {
      // 文件可能正在被写入，跳过
    }
  }
  return queries;
}

function removeMessage(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // 可能已被其他进程删除
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }
  return "";
}

// ═══════════════════════════════════════════════════════
//  查询注入与截获
// ═══════════════════════════════════════════════════════

async function injectQuery(queryFile: string, query: { id: string; from: string; text: string }): Promise<void> {
  _pendingReply = {
    from: query.from,
    queryId: query.id,
    queryFilePath: path.join(mailboxDir(_peerId), queryFile),
  };

  await _pi.sendUserMessage(
    `[来自 ${query.from} 的查询]\n${query.text}\n\n请回答该查询。`,
    { deliverAs: "steer" },
  );
}

function handlePoll(): void {
  if (!_inCircle) return;
  if (_pendingReply) return; // 已有待处理的查询

  const queries = pollMailbox();
  if (queries.length === 0) return;

  // 处理最早的一条
  injectQuery(queries[0].file, queries[0]);
}

function startPolling(): void {
  if (_pollTimer) return;
  _pollTimer = setInterval(handlePoll, POLL_MS);
  if (_pollTimer && typeof _pollTimer === "object" && "unref" in _pollTimer) {
    _pollTimer.unref();
  }
}

function stopPolling(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function startHeartbeat(): void {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(updateHeartbeat, HEARTBEAT_MS);
  if (_heartbeatTimer && typeof _heartbeatTimer === "object" && "unref" in _heartbeatTimer) {
    _heartbeatTimer.unref();
  }
}

function stopHeartbeat(): void {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

// ═══════════════════════════════════════════════════════
//  导出扩展
// ═══════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  _pi = pi;

  // 加载配置，初始化路径
  const config = loadConfig();
  _configDataDir = resolveDataDir(config);
  PEERS_FILE = path.join(_configDataDir, "peers.json");
  MAILBOX_DIR = path.join(_configDataDir, "mailbox");

  // fallback ID：立即用进程 PID 保证唯一（/peer-join 执行前 session_start 应已覆盖它）
  _peerId = `${os.hostname()}-${os.userInfo().username}-${process.pid}`;
  fs.mkdirSync(mailboxDir(_peerId), { recursive: true });

  // session_start 时用会话 ID 增强唯一性（但保留 PID 防止 --no-session 下会话 ID 重复）
  pi.on("session_start", (_event, ctx) => {
    const sid = ctx.sessionManager.getSessionId();
    _peerId = `${os.hostname()}-${os.userInfo().username}-${sid.slice(0, 6)}-${process.pid}`;
    fs.mkdirSync(mailboxDir(_peerId), { recursive: true });
  });

  // ── 命令 ──

  pi.registerCommand("peer-join", {
    description: "加入交流圈，接受其他终端的查询",
    handler: async (_args, ctx) => {
      if (_inCircle) {
        ctx.ui.notify("已在交流圈中", "info");
        return;
      }
      peerJoin();
      startHeartbeat();
      startPolling();
      ctx.ui.notify(`已加入交流圈 (${_peerId})`, "info");
    },
  });

  pi.registerCommand("peer-quit", {
    description: "退出交流圈，停止接受查询",
    handler: async (_args, ctx) => {
      if (!_inCircle) {
        ctx.ui.notify("当前不在交流圈中", "info");
        return;
      }
      stopHeartbeat();
      stopPolling();
      peerQuit();
      ctx.ui.notify("已退出交流圈", "info");
    },
  });

  pi.registerCommand("peer-status", {
    description: "查看所有同伴的在线状态",
    handler: async (_args, ctx) => {
      const statuses = getPeersStatus();
      let msg = `ID: ${_peerId} (${_inCircle ? "在交流圈" : "不在交流圈"})\n`;
      if (statuses.length === 0) {
        msg += "没有其他同伴";
      } else {
        for (const s of statuses) {
          const ago = Math.floor((Date.now() - s.lastSeen) / 1000);
          msg += `  ${s.id}  ${s.online ? "在线" : "离线"}  (${ago}秒前)\n`;
        }
      }
      ctx.ui.notify(msg, "info");
    },
  });

  // ── 工具 ──

  pi.registerTool({
    name: "peer_list",
    label: "Peer List",
    description: "列出所有在线的同伴终端",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const onlinePeers = getPeersStatus()
        .filter((s) => s.online)
        .map((s) => s.id);
      return {
        content: [{ type: "text", text: JSON.stringify(onlinePeers) }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "peer_ask",
    label: "Peer Ask",
    description: "向指定的同伴终端发送查询并等待回答",
    parameters: Type.Object({
      peer: Type.String({ description: "同伴终端 ID" }),
      question: Type.String({ description: "查询内容" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { peer, question } = params;

      if (!isPeerOnline(peer)) {
        return {
          content: [{ type: "text", text: `${peer} 不在线，无法查询` }],
          details: {},
        };
      }

      const queryId = sendQuery(peer, question);
      const deadline = Date.now() + PEER_TIMEOUT_MS;

      // 轮询自己信箱等待回答
      while (Date.now() < deadline) {
        const dir = mailboxDir(_peerId);
        let files: string[];
        try {
          files = fs.readdirSync(dir);
        } catch {
          files = [];
        }

        for (const file of files) {
          if (!file.startsWith("a-") || !file.endsWith(".json")) continue;
          try {
            const answer = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
            if (answer.replyTo === queryId) {
              removeMessage(path.join(dir, file));
              return {
                content: [{ type: "text", text: answer.text }],
                details: {},
              };
            }
          } catch {
            // 跳过正在写入的文件
          }
        }

        await new Promise((r) => setTimeout(r, 500));
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "查询已中止" }],
            details: {},
          };
        }
      }

      return {
        content: [{ type: "text", text: `${peer} 在 30 秒内未回复` }],
        details: {},
      };
    },
  });

  // ── 事件：截获 LLM 对 peer 查询的回答 ──

  pi.on("agent_end", async (event) => {
    if (!_pendingReply) return;
    const messages = (event as any).messages;
    if (!messages || messages.length === 0) return;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant") {
        const text = extractAssistantText(msg.content);
        if (text) {
          writeAnswer(_pendingReply.from, _pendingReply.queryId, text);
          removeMessage(_pendingReply.queryFilePath);
          _pendingReply = null;
        }
        break;
      }
    }
  });

  // ── 会话结束清理（/new、/reload、/fork）──

  pi.on("session_shutdown", () => {
    if (_inCircle) {
      peerQuit();
    }
    stopHeartbeat();
    stopPolling();
  });

  // ── 进程退出清理 ──

  process.on("exit", () => {
    if (_inCircle) {
      peerQuit();
    }
  });
}
