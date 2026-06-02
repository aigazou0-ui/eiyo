const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || (process.env.RENDER ? 10000 : 4173));
const ENGINE_PATH = process.env.YANEURAOU_PATH || path.join(ROOT, "engine", process.platform === "win32" ? "yaneuraou.exe" : "yaneuraou");
const EVAL_DIR = process.env.YANEURAOU_EVAL_DIR || path.join(ROOT, "engine", "eval");
const ENGINE_THREADS = Number(process.env.YANEURAOU_THREADS || 1);
const ENGINE_HASH = Number(process.env.YANEURAOU_HASH || 16);
const ENGINE_MULTIPV = Number(process.env.YANEURAOU_MULTIPV || 1);
const ENGINE_EDITION = process.env.YANEURAOU_EDITION || "";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

process.on("uncaughtException", error => {
  console.error("[fatal] uncaughtException", error && error.stack ? error.stack : error);
});

process.on("unhandledRejection", error => {
  console.error("[fatal] unhandledRejection", error && error.stack ? error.stack : error);
});

class UsiEngine {
  constructor(exePath, evalDir) {
    this.exePath = exePath;
    this.evalDir = evalDir;
    this.proc = null;
    this.ready = false;
    this.buffer = "";
    this.lines = [];
    this.pending = [];
    this.queue = Promise.resolve();
  }

  async ensureStarted() {
    if (this.ready && this.proc && !this.proc.killed) return;
    if (!fs.existsSync(this.exePath)) throw new Error(`Engine executable not found: ${this.exePath}`);

    console.log(`[engine] starting: ${this.exePath}`);
    this.proc = spawn(this.exePath, [], {
      cwd: path.dirname(this.exePath),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    console.log(`[engine] spawned pid=${this.proc.pid || "unknown"}`);
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", data => this.onData(data));
    this.proc.stderr.on("data", data => console.error("[engine]", data.trim()));
    this.proc.on("error", error => {
      console.error("[engine] spawn error", error && error.stack ? error.stack : error);
      this.ready = false;
      this.proc = null;
      this.flushPending(error);
    });
    this.proc.on("exit", (code, signal) => {
      console.error(`[engine] exited code=${code} signal=${signal || ""}`);
      this.ready = false;
      this.proc = null;
      this.flushPending(new Error(`USI engine exited: code=${code} signal=${signal || ""}`));
    });

    this.send("usi");
    await this.waitFor(line => line === "usiok", 10000);
    console.log("[engine] usiok");
    this.setOption("Threads", ENGINE_THREADS);
    this.setOption("Hash", ENGINE_HASH);
    this.setOption("MultiPV", ENGINE_MULTIPV);
    if (!/MATERIAL/i.test(ENGINE_EDITION) && fs.existsSync(path.join(this.evalDir, "nn.bin"))) {
      this.setOption("EvalDir", this.evalDir);
    }
    this.send("isready");
    await this.waitFor(line => line === "readyok", 20000);
    console.log("[engine] readyok");
    this.ready = true;
  }

  setOption(name, value) {
    if (value === undefined || value === null || value === "") return;
    this.send(`setoption name ${name} value ${value}`);
  }

  onData(data) {
    this.buffer += data;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() || "";
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      this.lines.push(line);
      const stillPending = [];
      for (const waiter of this.pending) {
        if (waiter.predicate(line)) waiter.resolve(line);
        else stillPending.push(waiter);
      }
      this.pending = stillPending;
    }
  }

  flushPending(error) {
    const pending = this.pending;
    this.pending = [];
    pending.forEach(waiter => waiter.reject(error));
  }

  send(command) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error("USI engine is not running");
    this.proc.stdin.write(`${command}\n`);
  }

  waitFor(predicate, timeoutMs) {
    return this.waitForFrom(this.lines.length, predicate, timeoutMs);
  }

  waitForFrom(fromIndex, predicate, timeoutMs) {
    for (const line of this.lines.slice(fromIndex)) {
      if (predicate(line)) return Promise.resolve(line);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = this.pending.filter(waiter => waiter.resolve !== resolve);
        reject(new Error("Timed out waiting for USI engine"));
      }, timeoutMs);
      this.pending.push({
        predicate,
        resolve: line => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  async bestmove(request) {
    const run = () => this.bestmoveNow(request);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async bestmoveNow({ sfen, byoyomi = 1000, movetime = 0 }) {
    await this.ensureStarted();
    const infoLines = [];
    const startIndex = this.lines.length;
    console.log(`[engine] bestmove start movetime=${movetime} byoyomi=${byoyomi}`);
    this.send("usinewgame");
    this.send(`position sfen ${sfen}`);
    this.send(movetime > 0 ? `go movetime ${movetime}` : `go byoyomi ${byoyomi}`);
    const timeoutMs = Math.max(5000, byoyomi + movetime + 8000);
    const bestLine = await this.waitForFrom(startIndex, line => line.startsWith("bestmove "), timeoutMs);
    console.log(`[engine] ${bestLine}`);
    for (const line of this.lines.slice(startIndex)) {
      if (line.startsWith("info ")) infoLines.push(line);
    }
    return parseSearchResult(bestLine, infoLines);
  }
}

function parseSearchResult(bestLine, infoLines) {
  const tokens = bestLine.split(/\s+/);
  const bestmove = tokens[1] || "resign";
  const ponderIndex = tokens.indexOf("ponder");
  const ponder = ponderIndex >= 0 ? tokens[ponderIndex + 1] : null;
  const byPv = new Map();
  let lastScore = null;

  for (const line of infoLines) {
    const parts = line.split(/\s+/);
    const multipvIndex = parts.indexOf("multipv");
    const multipv = multipvIndex >= 0 ? Number(parts[multipvIndex + 1] || 1) : 1;
    const scoreIndex = parts.indexOf("score");
    const pvIndex = parts.indexOf("pv");
    const score = scoreIndex >= 0 ? parseScore(parts, scoreIndex) : null;
    const pv = pvIndex >= 0 ? parts.slice(pvIndex + 1) : [];
    if (score) lastScore = score;
    if (pv.length) byPv.set(multipv, { move: pv[0], score, pv });
  }

  const candidates = Array.from(byPv.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([multipv, data]) => ({ multipv, ...data }));

  return { ok: true, bestmove, ponder, score: candidates[0] ? candidates[0].score : lastScore, candidates, info: infoLines.slice(-30) };
}

function parseScore(parts, scoreIndex) {
  const type = parts[scoreIndex + 1] || "unknown";
  const value = Number(parts[scoreIndex + 2] || 0);
  return { type, value };
}

const engine = new UsiEngine(ENGINE_PATH, EVAL_DIR);

function sendJson(res, status, payload) {
  const body = status === 204 ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "access-control-allow-origin": ALLOW_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function engineStatus() {
  return {
    ok: true,
    engineReady: engine.ready,
    engineExists: fs.existsSync(ENGINE_PATH),
    enginePath: ENGINE_PATH,
    evalDir: EVAL_DIR,
    evalExists: fs.existsSync(path.join(EVAL_DIR, "nn.bin")),
    edition: ENGINE_EDITION || null,
    threads: ENGINE_THREADS,
    hash: ENGINE_HASH,
    multipv: ENGINE_MULTIPV
  };
}

async function handleApi(req, res) {
  const urlPath = (req.url || "").split("?")[0];
  console.log(`[http] ${req.method} ${urlPath}`);
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === "GET" && (urlPath === "/health" || urlPath === "/api/engine/status")) {
    sendJson(res, 200, engineStatus());
    return;
  }
  if (req.method === "GET" && urlPath === "/test-bestmove") {
    try {
      const started = Date.now();
      const result = await engine.bestmove({
        sfen: "lnsgkgsnl/1r5b1/p1ppppppp/9/9/9/P1PPPPPPP/1B5R1/LNSGKGSNL b - 1",
        byoyomi: 1000,
        movetime: 500
      });
      sendJson(res, 200, {
        ...result,
        test: true,
        elapsedMs: Date.now() - started
      });
    } catch (error) {
      console.error("[http] test-bestmove failed", error && error.stack ? error.stack : error);
      sendJson(res, 503, { ...engineStatus(), ok: false, test: true, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && (urlPath === "/bestmove" || urlPath === "/api/engine/bestmove")) {
    try {
      const body = await readJson(req);
      console.log(`[http] bestmove request level=${body.level || "normal"} purpose=${body.purpose || "cpu"} ply=${body.ply ?? ""}`);
      if (!body.sfen || typeof body.sfen !== "string") {
        sendJson(res, 400, { ok: false, error: "sfen is required" });
        return;
      }
      const level = body.level === "strong" ? "strong" : "normal";
      const defaultMovetime = level === "strong" ? 1500 : 500;
      const started = Date.now();
      const result = await engine.bestmove({
        sfen: body.sfen,
        byoyomi: Number(body.byoyomi || 1000),
        movetime: Number(body.movetime || defaultMovetime)
      });
      sendJson(res, 200, {
        ...result,
        level,
        requestId: body.requestId || null,
        purpose: body.purpose || "cpu",
        side: body.side || null,
        ply: Number.isFinite(Number(body.ply)) ? Number(body.ply) : null,
        elapsedMs: Date.now() - started
      });
    } catch (error) {
      console.error("[http] bestmove failed", error && error.stack ? error.stack : error);
      sendJson(res, 503, { ...engineStatus(), ok: false, error: error.message || String(error) });
    }
    return;
  }
  sendJson(res, 404, { ok: false, error: "API not found" });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "").split("?")[0];
  if (req.method === "OPTIONS" || urlPath === "/health" || urlPath === "/test-bestmove" || urlPath === "/bestmove" || urlPath.startsWith("/api/")) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Shogi engine server: http://127.0.0.1:${PORT}/`);
  console.log(`YaneuraOu path: ${ENGINE_PATH}`);
  console.log(`Eval dir: ${EVAL_DIR}`);
});
