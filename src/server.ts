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
 * the API is only reachable from this machine.
 */
export async function startServer(opts: ServeOptions = {}): Promise<ServerHandle> {
  const windowDays = opts.windowDays ?? 30;
  const server = http.createServer((req, res) => {
    handler(req, res, windowDays).catch((err) => {
      sendJson(res, 500, { error: String(err) });
    });
  });

  await listenOn(server, opts.port ?? DEFAULT_PORT);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
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

async function handler(req: http.IncomingMessage, res: http.ServerResponse, windowDays: number): Promise<void> {
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
    const body = await readJsonBody(req);
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

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
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
