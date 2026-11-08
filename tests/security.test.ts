import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as http from "node:http";
import { connect as net_connect } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { collect } from "../src/core/collect.ts";
import { renderHtml, toJson } from "../src/core/report.ts";
import { renderWrappedHtml } from "../src/core/wrapped.ts";
import { main } from "../src/cli.ts";
import { applyFix, restore, writeManifest } from "../src/fix.ts";
import { startServer } from "../src/server.ts";
import { loadSkillDirs } from "../src/adapters/skill-loader.ts";
import { parseFrontmatter } from "../src/util/frontmatter.ts";
import { SKILL_PATH_RE } from "../src/util/sqlite-scan.ts";
import { MAX_FILE_BYTES } from "../src/util/fsx.ts";

/**
 * Security suite — an OWASP-style self-assessment for a local, zero-network
 * CLI that also serves a loopback dashboard. Threat model:
 *
 *   1. Hostile skill packs (cloned repos): SKILL.md frontmatter fields,
 *      directory names and even transcript contents are attacker-controlled
 *      strings that reach the terminal, the HTML reports and the dashboard.
 *   2. Hostile web pages attacking the dashboard while it runs: cross-site
 *      POSTs (CSRF) and DNS-rebinding reads must both be rejected.
 *   3. Oversized / pathological inputs: giant files, huge frontmatter values,
 *      adversarial regex inputs, oversized request bodies.
 *   4. Filesystem integrity: quarantine writes stay inside the quarantine
 *      root; restore never overwrites; symlinks are not followed.
 *
 * Every test runs against a throwaway SKILL_SLIM_HOME — nothing here touches
 * the real ~/.claude or ~/.codex.
 */

const NAME_PAYLOAD = '<script>alert("name")</script>';
const IMG_NAME_PAYLOAD = "<img src=x onerror=alert(2)>";
const DESC_PAYLOAD = 'deploys <img src=x onerror=alert(1)> services & "quotes" <b>bold</b>';
// dir names with a closing-tag sequence (</) are unreliable on some filesystem
// sandboxes, so the hostile dir name uses an open tag — the escaping requirement
// under test is identical
const DIRNAME_PAYLOAD = "dir-with-<b>html";

function tempHome(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSkill(home: string, dirName: string, name: string, description: string): string {
  const dir = path.join(home, ".claude", "skills", dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nSECRET-SKILL-BODY-MARKER\n`,
  );
  return dir;
}

/** Raw node:http request — full control over Host/Origin/Sec-Fetch-Site. */
function request(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: opts.method ?? "GET",
        path: opts.path ?? "/",
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const home = tempHome("sd-sec-");
  process.env.SKILL_SLIM_HOME = home;
  const handle = await startServer({ port: 0, open: false });
  try {
    await fn(handle.port);
  } finally {
    await handle.close();
    delete process.env.SKILL_SLIM_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. Stored XSS via hostile skill packs → HTML reports
// ---------------------------------------------------------------------------

test("health report escapes hostile skill names, descriptions and dir names", async () => {
  const home = tempHome("sd-xss-");
  process.env.SKILL_SLIM_HOME = home;
  try {
    writeSkill(home, DIRNAME_PAYLOAD, NAME_PAYLOAD, DESC_PAYLOAD);
    writeSkill(home, "twin-pack", IMG_NAME_PAYLOAD, DESC_PAYLOAD);
    const { report } = await collect(30);
    const html = renderHtml(report);
    assert.doesNotMatch(html, /<script\b/);
    assert.doesNotMatch(html, /<img\b/);
    assert.ok(html.includes("&lt;script&gt;"), "script payload must appear only in escaped form");
    assert.ok(html.includes("&lt;img src=x onerror=alert(2)&gt;"), "img payload must appear only in escaped form");
    assert.ok(html.includes(`&lt;b&gt;html`), "hostile dir name must appear only in escaped form");
    // the payloads actually reached findings — this test guards a real flow
    const findings = report.agents.flatMap((a) => a.findings);
    assert.ok(findings.some((f) => f.title.includes(NAME_PAYLOAD)));
    assert.ok(findings.some((f) => f.title.includes(IMG_NAME_PAYLOAD)));
  } finally {
    delete process.env.SKILL_SLIM_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("wrapped bill escapes hostile names coming from transcripts", async () => {
  const home = tempHome("sd-wrap-");
  process.env.SKILL_SLIM_HOME = home;
  try {
    writeSkill(home, "wrapped-skill", NAME_PAYLOAD, DESC_PAYLOAD);
    // transcript invocation: the payload flows in from session data too
    const proj = path.join(home, ".claude", "projects", "proj");
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(
      path.join(proj, "session.jsonl"),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Skill", input: { command: NAME_PAYLOAD } }] },
      }) + "\n",
    );
    const { report, scans } = await collect(30);
    const html = renderWrappedHtml(report, scans);
    assert.doesNotMatch(html, /<script\b/);
    assert.doesNotMatch(html, /<img\b/);
    assert.ok(html.includes("&lt;script&gt;alert"));
  } finally {
    delete process.env.SKILL_SLIM_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Privacy — reports aggregate, they never re-publish file bodies
// ---------------------------------------------------------------------------

test("JSON report carries no skill or instruction file bodies", async () => {
  const home = tempHome("sd-priv-");
  process.env.SKILL_SLIM_HOME = home;
  try {
    writeSkill(home, "privacy-probe", "privacy-probe", "probe description");
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "SECRET-INSTRUCTION-BODY-MARKER\n");
    const { report, scans } = await collect(30);
    // sanity: the scanner really read both files
    assert.ok(scans.some((s) => s.skills.some((k) => k.body.includes("SECRET-SKILL-BODY-MARKER"))));
    assert.ok(scans.some((s) => s.instructions.some((i) => i.content.includes("SECRET-INSTRUCTION-BODY-MARKER"))));
    // the report aggregates — bodies never leave the scan layer
    const json = toJson(report);
    assert.ok(!json.includes("SECRET-SKILL-BODY-MARKER"));
    assert.ok(!json.includes("SECRET-INSTRUCTION-BODY-MARKER"));
  } finally {
    delete process.env.SKILL_SLIM_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("dashboard scan API returns application/json, not attacker-renderable markup", async () => {
  await withServer(async (port) => {
    const res = await request(port, { path: "/api/scan" });
    assert.equal(res.status, 200);
    assert.ok((res.headers["content-type"] ?? "").startsWith("application/json"));
    assert.doesNotThrow(() => JSON.parse(res.body));
  });
});

// ---------------------------------------------------------------------------
// 3. Dashboard access control — CSRF & DNS-rebinding rejection
// ---------------------------------------------------------------------------

test("rejects requests with a non-loopback Host header (DNS rebinding)", async () => {
  await withServer(async (port) => {
    const evil = await request(port, { path: "/", headers: { host: "evil.example" } });
    assert.equal(evil.status, 403);
    // suffix trick: loopback only ever matches the exact hostname
    const suffix = await request(port, { path: "/api/scan", headers: { host: "127.0.0.1.evil.example" } });
    assert.equal(suffix.status, 403);
    const rebinding = await request(port, { path: "/api/scan", headers: { host: "attacker-controlled.example:7466" } });
    assert.equal(rebinding.status, 403);
  });
});

test("rejects requests without a Host header", async () => {
  await withServer(async (port) => {
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const socket = net_connect(port);
      const out: Buffer[] = [];
      socket.on("data", (d: Buffer) => out.push(d));
      socket.on("end", () => {
        const text = Buffer.concat(out).toString("utf8");
        resolve({ status: Number((/^HTTP\/1\.[01] (\d{3})/.exec(text) ?? [])[1] ?? 0) });
      });
      socket.on("error", reject);
      socket.end("GET /api/scan HTTP/1.0\r\n\r\n");
    });
    assert.equal(res.status, 403);
  });
});

test("POST with a cross-site Origin is rejected (CSRF)", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    assert.equal(res.status, 403);
    // sandboxed-iframe null origin is not a trusted origin either
    const nul = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { Origin: "null", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(nul.status, 403);
  });
});

test("text/plain JSON smuggling is rejected like any other cross-site POST", async () => {
  await withServer(async (port) => {
    // a simple request: no preflight, JSON body with a text/plain content-type
    const res = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { Origin: "http://evil.example", "Content-Type": "text/plain" },
      body: JSON.stringify({ name: "x" }),
    });
    assert.equal(res.status, 403);
  });
});

test("POST with cross-site Sec-Fetch-Site metadata is rejected", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/api/fix/plan",
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(res.status, 403);
  });
});

test("same-origin and header-less (CLI/curl) POSTs still work", async () => {
  await withServer(async (port) => {
    const curlStyle = await request(port, { method: "POST", path: "/api/fix/plan" });
    assert.equal(curlStyle.status, 200);

    const sameOrigin = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { Origin: `http://127.0.0.1:${port}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "nothing-matches" }),
    });
    assert.equal(sameOrigin.status, 200);
    assert.deepEqual(JSON.parse(sameOrigin.body), { restored: [], skipped: [] });

    const localhostOrigin = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { Origin: `http://localhost:${port}`, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(localhostOrigin.status, 200);
  });
});

test("unknown routes answer 404 without leaking stack traces", async () => {
  await withServer(async (port) => {
    const res = await request(port, { path: "/api/does-not-exist" });
    assert.equal(res.status, 404);
    assert.ok(!res.body.includes("\n    at "), "no stack frames in error bodies");
  });
});

// ---------------------------------------------------------------------------
// 4. Request-body hardening
// ---------------------------------------------------------------------------

test("oversized JSON bodies get an explicit 413 and the server stays alive", async () => {
  await withServer(async (port) => {
    const big = JSON.stringify({ name: "x".repeat(1024 * 1024 + 16) });
    const res = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { "Content-Type": "application/json" },
      body: big,
    });
    assert.equal(res.status, 413);
    const after = await request(port, { path: "/api/scan" });
    assert.equal(after.status, 200);
  });
});

test("malformed JSON bodies are treated as absent, not as a crash", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/api/restore",
      headers: { "Content-Type": "application/json" },
      body: "{this is not json",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { restored: [], skipped: [] });
  });
});

// ---------------------------------------------------------------------------
// 5. Input-size and regex-DoS hardening
// ---------------------------------------------------------------------------

test("SKILL.md files above the 2MB cap are skipped, not read", async () => {
  const home = tempHome("sd-cap-");
  try {
    const skills = path.join(home, "skills");
    const overCap = path.join(skills, "bloated");
    fs.mkdirSync(overCap, { recursive: true });
    fs.writeFileSync(path.join(overCap, "SKILL.md"), `---\nname: bloated\ndescription: x\n---\n${"x".repeat(MAX_FILE_BYTES)}\n`);
    const normal = path.join(skills, "normal");
    fs.mkdirSync(normal, { recursive: true });
    fs.writeFileSync(
      path.join(normal, "SKILL.md"),
      "---\nname: normal\ndescription: fine\n---\nbody\n",
    );
    const skillsLoaded = await loadSkillDirs("claude-code", [{ dir: skills, source: "global" }]);
    assert.deepEqual(skillsLoaded.map((s) => s.name), ["normal"]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("a multi-megabyte frontmatter value parses in bounded time", () => {
  const raw = `---\nname: ${"a".repeat(1_900_000)}\ndescription: tiny\n---\nbody\n`;
  const start = Date.now();
  const { data } = parseFrontmatter(raw);
  assert.ok(Date.now() - start < 2000, "frontmatter parsing must stay linear");
  assert.equal(data.name.length, 1_900_000);
  assert.equal(data.description, "tiny");
});

test("skill-path regex stays linear on adversarial input", () => {
  const adversarial = "skills/" + "a".repeat(200_000) + "!SKILL.md" + " skills/x/SKILL.md ".repeat(2000);
  const start = Date.now();
  const hits = [...adversarial.matchAll(SKILL_PATH_RE)];
  assert.ok(Date.now() - start < 2000, "SKILL_PATH_RE must not backtrack catastrophically");
  assert.equal(hits.length, 2000);
});

// ---------------------------------------------------------------------------
// 6. Frontmatter keys cannot poison the prototype chain
// ---------------------------------------------------------------------------

test("frontmatter __proto__ and constructor keys stay inert", () => {
  const { data } = parseFrontmatter(
    '---\n__proto__: polluted\nconstructor: ctor-value\nconstructor.prototype: deep\nhasOwnProperty: own\n---\nbody\n',
  );
  assert.equal(Object.getPrototypeOf(data), Object.prototype, "__proto__ must not change the prototype");
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal((Object.prototype as unknown as Record<string, unknown>).polluted, undefined);
  assert.ok(!Object.keys(data).includes("__proto__"));
  // string-valued keys are inert shadows, not escapes
  assert.equal(data.constructor, "ctor-value");
});

// ---------------------------------------------------------------------------
// 7. Filesystem integrity — quarantine containment & restore safety
// ---------------------------------------------------------------------------

test("quarantine destinations can never escape the quarantine root", async () => {
  const home = tempHome("sd-qr-");
  try {
    const skillDir = writeSkill(home, "sub..dir", "sub..dir", "traversal probe");
    const goodMove = { agent: "claude-code", from: skillDir, to: "claude-code/sub..dir", reason: "t", recoverableTokens: 0 };
    const moved = await applyFix([goodMove], home);
    assert.equal(moved.moved.length, 1);
    const quarantineRoot = path.join(home, ".skill-slim", "quarantine");
    assert.ok(
      path.resolve(moved.moved[0].to).startsWith(quarantineRoot + path.sep),
      "destination must stay inside the quarantine root",
    );

    // a hand-crafted traversal target must be refused, not written
    fs.mkdirSync(path.join(home, ".claude", "skills", "second"), { recursive: true });
    const evilMove = {
      agent: "claude-code",
      from: path.join(home, ".claude", "skills", "second"),
      to: "claude-code/../../escaped-target",
      reason: "t",
      recoverableTokens: 0,
    };
    const refused = await applyFix([evilMove], home);
    assert.equal(refused.moved.length, 0);
    assert.equal(refused.failed.length, 1);
    assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "second")), "source must be untouched on refusal");
    assert.ok(!fs.existsSync(path.join(home, "escaped-target")), "nothing may land outside the quarantine root");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("restore skips entries whose original path is occupied — never overwrites", async () => {
  const home = tempHome("sd-restore-");
  try {
    const originalPath = path.join(home, ".claude", "skills", "ghost");
    const quarantinedPath = path.join(home, ".skill-slim", "quarantine", "claude-code", "ghost");
    fs.mkdirSync(quarantinedPath, { recursive: true });
    fs.writeFileSync(path.join(quarantinedPath, "SKILL.md"), "---\nname: ghost\ndescription: q\n---\nq\n");
    // the user recreated the skill (or something else lives there now)
    fs.mkdirSync(originalPath, { recursive: true });
    fs.writeFileSync(path.join(originalPath, "SKILL.md"), "---\nname: ghost\ndescription: recreated\n---\nnew\n");
    await writeManifest(home, [
      { agent: "claude-code", name: "ghost", originalPath, quarantinedPath, movedAt: new Date().toISOString() },
    ]);
    const { restored, skipped } = await restore(home, "ghost");
    assert.equal(restored.length, 0);
    assert.deepEqual(skipped.map((s) => s.reason), ["original path is occupied"]);
    assert.equal(fs.readFileSync(path.join(originalPath, "SKILL.md"), "utf8").includes("recreated"), true);
    assert.ok(fs.existsSync(path.join(quarantinedPath, "SKILL.md")), "quarantined copy is kept for manual recovery");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("symlinked skill directories are not followed out of the skills root", async () => {
  if (process.platform === "win32") return; // symlink perms differ; the Dirent check is platform-independent
  const home = tempHome("sd-sym-");
  try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sd-outside-"));
    fs.writeFileSync(
      path.join(outside, "SKILL.md"),
      "---\nname: escaped\ndescription: SECRET-OUTSIDE-MARKER\n---\nx\n",
    );
    const skills = path.join(home, "skills");
    fs.mkdirSync(skills, { recursive: true });
    fs.symlinkSync(outside, path.join(skills, "innocent-link"));
    const real = path.join(skills, "real");
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(path.join(real, "SKILL.md"), "---\nname: real\ndescription: real\n---\nx\n");
    const loaded = await loadSkillDirs("claude-code", [{ dir: skills, source: "global" }]);
    assert.deepEqual(loaded.map((s) => s.name), ["real"]);
    fs.rmSync(outside, { recursive: true, force: true });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. The one process-exec sink (browser opener) sits behind strict arg parsing
// ---------------------------------------------------------------------------

test("CLI arg parser rejects shell-flavored values for exec-adjacent options", async () => {
  // main() reports arg errors via process.exitCode — restore it afterwards so
  // the failing-args under test don't fail the whole test process
  const prevExitCode = process.exitCode;
  try {
    const cases: string[][] = [
      ["serve", "--port", "7466; touch /tmp/skill-slim-pwned"],
      ["serve", "--port", "$(reboot)"],
      ["serve", "--port", "7466 && rm -rf /"],
      ["check", "--days", "1; reboot"],
      ["check", "--min-score", "80; reboot"],
      ["check", "--max-always-on-tokens", "1 && reboot"],
      ["check", "--agent", "claude-code; reboot"],
    ];
    for (const argv of cases) {
      const code = await main(argv);
      assert.equal(code, 2, `expected rejection for: ${argv.join(" ")}`);
    }
    assert.ok(!fs.existsSync("/tmp/skill-slim-pwned"), "no command may have executed");
  } finally {
    process.exitCode = prevExitCode;
  }
});
