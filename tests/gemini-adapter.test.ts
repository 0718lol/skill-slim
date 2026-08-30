import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { geminiCliAdapter } from "../src/adapters/gemini-cli.ts";
import { runChecks } from "../src/core/checks.ts";

function writeSkill(home: string, name: string, description: string): void {
  const dir = path.join(home, ".gemini", "config", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nBody for ${name}.\n`,
  );
}

function makeConversationDb(home: string, name: string, withSkillTrace: boolean): void {
  const dir = path.join(home, ".gemini", "antigravity", "conversations");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, name));
  db.exec("CREATE TABLE trajectory_meta (trajectory_id TEXT)");
  db.exec("CREATE TABLE steps (step_payload BLOB, metadata BLOB)");
  db.prepare("INSERT INTO trajectory_meta (trajectory_id) VALUES (?)").run("t1");
  db.prepare("INSERT INTO trajectory_meta (trajectory_id) VALUES (?)").run("t2");
  const payloads = withSkillTrace
    ? ["cat ~/.gemini/config/skills/alpha/SKILL.md", "unrelated output mentioning nothing"]
    : ["plain assistant text", "no skill references here"];
  for (const p of payloads) {
    db.prepare("INSERT INTO steps (step_payload) VALUES (?)").run(new TextEncoder().encode(p));
  }
  db.close();
}

test("gemini adapter finds config/skills and gated usage from conversation dbs", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-gemini-"));
  writeSkill(home, "alpha", "Gemini test skill alpha");
  writeSkill(home, "ghost", "Gemini test skill ghost");
  makeConversationDb(home, "conv.db", true);

  const scan = await geminiCliAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name).sort(), ["alpha", "ghost"]);
  assert.equal(scan.usageAvailable, true);
  assert.equal(scan.conversationCount, 2);
  assert.ok((scan.usage.get("alpha")?.count ?? 0) >= 1);
  assert.ok(!scan.usage.has("ghost"));

  const report = runChecks(scan, 30);
  assert.equal(report.findings.filter((f) => f.kind === "unused").length, 1);
  fs.rmSync(home, { recursive: true, force: true });
});

test("gemini adapter abstains on usage when conversations never mention skills", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-gemini2-"));
  writeSkill(home, "alpha", "Gemini test skill alpha");
  makeConversationDb(home, "conv.db", false);

  const scan = await geminiCliAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.usageAvailable, false, "no skill-system trace must mean unknown, not unused");
  assert.equal(scan.conversationCount, 2);
  assert.equal(runChecks(scan, 30).findings.filter((f) => f.kind === "unused").length, 0);
  fs.rmSync(home, { recursive: true, force: true });
});

test("gemini adapter reports not-detected for empty home", async () => {
  const scan = await geminiCliAdapter.scan({ home: "/nonexistent-home-xyz", cwd: "/tmp", windowDays: 30 });
  assert.equal(scan.detected, false);
  assert.equal(scan.skills.length, 0);
});
