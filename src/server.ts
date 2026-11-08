import * as http from "node:http";
import { exec } from "node:child_process";
import { collect, getHome } from "./core/collect.ts";
import { renderPage } from "./ui.ts";
import { applyFix, estimateMonthlySavings, planFix, readManifest, restore, totalSavings } from "./fix.ts";

const DEFAULT_PORT = 7466;
const MAX_BODY_BYTES = 1024 * 1024;

export interface ServerHandle {
  port: number;
  wait(): Promise<void>;
  close(): Promise<void>;
}

export interface ServeOptions {
  port?: number;
  open?: boolean;
  windowDays?: number;
}

/**
 * Local dashboard server. Binds 127.0.0.1 only, serves the static UI and a
 * small JSON API on top of the same scanner/fixer the CLI uses. No CORS —
 * the API is only reachable from this machine. Every request must present a
 * loopback Host header (DNS-rebinding defense) and state-changing POSTs must
 * carry same-origin browser metadata (CSRF defense); header-less clients
 * (curl, CI scripts) keep working.
 */
export async function startServer(opts: ServeOptions = {}): Promise<ServerHandle> {
  const windowDays = opts.windowDays ?? 30;
  const bound = { port: opts.port ?? DEFAULT_PORT };
  const server = http.createServer((req, res) => {
    handler(req, res, windowDays, bound.port).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: String(err) });
      else res.destroy();
    });
  });

  await listenOn(server, opts.port ?? DEFAULT_PORT);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
  bound.port = port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  skill-slim 仪表盘 → ${url}`);
  if (opts.open !== false) openBrowser(url);

  return {
    port,
    wait: () => new Promise<void>((resolve) => server.on("close", resolve)),
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function listenOn(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const maxAttempts = 20;
    const tryListen = (): void => {
      server.once("error", onError);
      server.listen(port + attempt, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve();
      });
    };
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener("error", onError);
      if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
        attempt++;
        tryListen();
      } else {
        reject(err);
      }
    };
    tryListen();
  });
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** DNS-rebinding defense: only the loopback names may address the API. */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const bare = host.toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTNAMES.has(bare);
}

/**
 * CSRF defense: browsers always attach Origin to POSTs and cannot forge it,
 * so a present-but-foreign Origin (or cross-site Sec-Fetch-Site) means the
 * request was not initiated by the dashboard page. Header-less clients are
 * not browsers and are allowed through.
 */
function crossSiteRequest(req: http.IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let url: URL;
    try {
      url = new URL(origin.toLowerCase());
    } catch {
      return true; // unparseable origin — not the dashboard's
    }
    const allowed = LOOPBACK_HOSTNAMES.has(url.hostname) && url.port === String(port) && url.protocol === "http:";
    if (!allowed) return true;
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return true;
  return false;
}

async function handler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  windowDays: number,
  port: number,
): Promise<void> {
  if (!isLoopbackHost(req.headers.host)) {
    sendJson(res, 403, { error: "forbidden: loopback host required" });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD" && crossSiteRequest(req, port)) {
    sendJson(res, 403, { error: "forbidden: cross-site request rejected" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderPage());
    return;
  }
  if (route === "GET /api/scan") {
    const { report } = await collect(windowDays);
    sendJson(res, 200, { report, windowDays });
    return;
  }
  if (route === "GET /api/quarantine") {
    sendJson(res, 200, await readManifest(getHome()));
    return;
  }
  if (route === "POST /api/fix/plan") {
    const { report, scans } = await collect(windowDays);
    const moves = planFix(scans);
    const conversations = new Map(scans.map((s) => [s.id, s.conversationCount]));
    sendJson(res, 200, {
      moves,
      savingsTokens: totalSavings(moves),
      monthlySavings: estimateMonthlySavings(moves, conversations, windowDays),
      currentScore: report.score,
    });
    return;
  }
  if (route === "POST /api/fix/apply") {
    const before = await collect(windowDays);
    const moves = planFix(before.scans);
    if (moves.length === 0) {
      sendJson(res, 200, { moved: [], failed: [], report: before.report });
      return;
    }
    const { moved, failed } = await applyFix(moves, getHome());
    const after = await collect(windowDays);
    sendJson(res, 200, {
      moved,
      failed,
      report: after.report,
      beforeScore: before.report.score,
      beforeTokens: before.report.totalAlwaysOnTokens,
    });
    return;
  }
  if (route === "POST /api/restore") {
    const body = await readJsonBody(req, res);
    if (body === TOO_LARGE) return; // 413 already sent
    const result = await restore(getHome(), body?.name, body?.agent);
    sendJson(res, 200, result);
    return;
  }
  sendJson(res, 404, { error: `unknown route ${route}` });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Sentinel for bodies over MAX_BODY_BYTES — the 413 has been sent already. */
const TOO_LARGE = Symbol("too-large");

function readJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Record<string, unknown> | null | typeof TOO_LARGE> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        // respond early and let the connection close gracefully — destroying
        // the socket here would RST before the client reads the response
        res.writeHead(413, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "close",
        });
        res.end(JSON.stringify({ error: "request body too large" }));
        resolve(TOO_LARGE);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, () => {
    /* browser opening is best-effort; the URL is printed anyway */
  });
}
