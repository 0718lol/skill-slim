import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startServer } from "../src/server.ts";

async function makeFixtureHome(): Promise<string> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-server-"));
  const claude = path.join(home, ".claude");
  for (const name of ["alpha", "ghost"]) {
    const dir = path.join(claude, "skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: Server test skill ${name} for review tasks\n---\nbody\n`,
    );
  }
  fs.mkdirSync(path.join(claude, "projects", "proj"), { recursive: true });
  fs.writeFileSync(
    path.join(claude, "projects", "proj", "session.jsonl"),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { command: "alpha" } }] } }) + "\n",
  );
  return home;
}

test("dashboard server serves UI and the full scan→plan→apply→restore flow", async () => {
  const home = await makeFixtureHome();
  process.env.SKILL_SLIM_HOME = home;
  const { startServer: _unused } = { startServer };
  const handle = await startServer({ port: 0, open: false, windowDays: 30 });
  const base = `http://127.0.0.1:${handle.port}`;

  try {
    const page = await fetch(`${base}/`).then((r) => r.text());
    assert.ok(page.includes("skill-slim"));
    assert.ok(page.includes("综合健康分"));

    const scan = await fetch(`${base}/api/scan`).then((r) => r.json());
    const claude = scan.report.agents.find((a: { id: string }) => a.id === "claude-code");
    assert.equal(claude.detected, true);
    assert.equal(claude.skillCount, 2);

    const plan = await fetch(`${base}/api/fix/plan`, { method: "POST" }).then((r) => r.json());
    assert.equal(plan.moves.length, 1, "only the never-invoked ghost skill is proposed");
    assert.equal(plan.moves[0].to, "claude-code/ghost");
    assert.ok(plan.savingsTokens > 0);

    const apply = await fetch(`${base}/api/fix/apply`, { method: "POST" }).then((r) => r.json());
    assert.equal(apply.moved.length, 1);
    assert.ok(!fs.existsSync(path.join(home, ".claude", "skills", "ghost")));
    assert.ok(apply.report.score >= apply.beforeScore);

    const quarantined = await fetch(`${base}/api/quarantine`).then((r) => r.json());
    assert.equal(quarantined.length, 1);
    assert.equal(quarantined[0].name, "ghost");

    const restored = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ghost", agent: "claude-code" }),
    }).then((r) => r.json());
    assert.equal(restored.restored.length, 1);
    assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "ghost")));
  } finally {
    await handle.close();
    delete process.env.SKILL_SLIM_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
