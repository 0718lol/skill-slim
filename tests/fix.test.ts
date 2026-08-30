import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyFix, estimateMonthlySavings, planFix, readManifest, restore, totalSavings } from "../src/fix.ts";
import type { AgentScan, Skill, UsageStat } from "../src/types.ts";

function makeScan(tmpRoot: string, skills: { name: string; used: boolean }[]): AgentScan {
  const usage = new Map<string, UsageStat>();
  const skillObjs: Skill[] = skills.map((s) => {
    const dir = path.join(tmpRoot, "skills", s.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s.name}\ndescription: test\n---\nbody\n`);
    if (s.used) usage.set(s.name, { count: 3 });
    return {
      agent: "claude-code",
      name: s.name,
      dirName: s.name,
      description: "test",
      body: "body",
      path: dir,
      source: "global",
    };
  });
  return {
    id: "claude-code",
    name: "Claude Code",
    detected: true,
    skills: skillObjs,
    instructions: [],
    usage,
    usageAvailable: true,
    conversationCount: 1,
    notes: [],
  };
}

test("planFix carries recoverable tokens and savings math checks out", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-savings-"));
  fs.mkdirSync(path.join(tmp, "skills", "stale"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "skills", "stale", "SKILL.md"), "---\nname: stale\ndescription: x\n---\nbody\n");
  const scan = makeScan(tmp, [{ name: "stale", used: false }]);
  scan.skills[0].description = "a".repeat(3800); // ~1000 tokens heuristic
  const moves = planFix([scan]);
  assert.equal(moves.length, 1);
  assert.ok(moves[0].recoverableTokens > 900, `expected ~1000, got ${moves[0].recoverableTokens}`);
  assert.equal(totalSavings(moves), moves[0].recoverableTokens);

  const monthly = estimateMonthlySavings(moves, new Map([["claude-code", 100]]), 30);
  const expected = (moves[0].recoverableTokens / 1_000_000) * 3 * 100;
  assert.ok(Math.abs(monthly - expected) < 1e-9);
  assert.equal(estimateMonthlySavings(moves, new Map([["claude-code", 0]]), 30), 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("planFix only proposes never-invoked skills", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-plan-"));
  const scan = makeScan(tmp, [
    { name: "used", used: true },
    { name: "stale", used: false },
  ]);
  const moves = planFix([scan]);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, path.join(tmp, "skills", "stale"));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("applyFix moves directories into quarantine and leaves used skills alone", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-apply-"));
  const fakeHome = path.join(tmp, "home");
  fs.mkdirSync(fakeHome);
  const scan = makeScan(tmp, [
    { name: "used", used: true },
    { name: "stale", used: false },
  ]);
  const moves = planFix([scan]);
  const { moved, failed } = await applyFix(moves, fakeHome);
  assert.equal(failed.length, 0);
  assert.equal(moved.length, 1);
  assert.ok(fs.existsSync(path.join(fakeHome, ".skill-doctor", "quarantine", "claude-code", "stale")));
  assert.ok(!fs.existsSync(path.join(tmp, "skills", "stale")));
  assert.ok(fs.existsSync(path.join(tmp, "skills", "used")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("restore moves quarantined skills back and clears the manifest entry", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-restore-"));
  const fakeHome = path.join(tmp, "home");
  fs.mkdirSync(fakeHome);
  const scan = makeScan(tmp, [{ name: "stale", used: false }]);
  await applyFix(planFix([scan]), fakeHome);
  assert.ok(!fs.existsSync(path.join(tmp, "skills", "stale")));

  const manifest = await readManifest(fakeHome);
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].name, "stale");

  const { restored, skipped } = await restore(fakeHome, "stale");
  assert.equal(skipped.length, 0);
  assert.equal(restored.length, 1);
  assert.ok(fs.existsSync(path.join(tmp, "skills", "stale")));
  assert.ok(!(await readManifest(fakeHome)).some((e) => e.name === "stale"));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("restore never overwrites an occupied original path", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-occupied-"));
  const fakeHome = path.join(tmp, "home");
  fs.mkdirSync(fakeHome);
  const scan = makeScan(tmp, [{ name: "stale", used: false }]);
  await applyFix(planFix([scan]), fakeHome);
  fs.mkdirSync(path.join(tmp, "skills", "stale")); // recreate a dir at the original spot
  const { restored, skipped } = await restore(fakeHome, "stale");
  assert.equal(restored.length, 0);
  assert.equal(skipped.length, 1);
  assert.ok(fs.existsSync(path.join(tmp, "skills", "stale")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
