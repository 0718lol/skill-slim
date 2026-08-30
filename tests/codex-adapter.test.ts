import assert from "node:assert/strict";
import { test } from "node:test";
import * as path from "node:path";
import { codexAdapter } from "../src/adapters/codex.ts";
import { runChecks } from "../src/core/checks.ts";

const fixtureHome = path.join(import.meta.dirname!, "fixtures", "codex-home");

test("codex adapter discovers skills, bundled plugins and parses usage", async () => {
  const scan = await codexAdapter.scan({ home: fixtureHome, cwd: fixtureHome, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.equal(scan.usageAvailable, true);
  assert.equal(scan.conversationCount, 1);

  const names = scan.skills.map((s) => s.name).sort();
  assert.deepEqual(names, ["alpha", "browser-skill"]);
  assert.equal(scan.skills.find((s) => s.name === "browser-skill")!.source, "plugin");

  assert.ok((scan.usage.get("alpha")?.count ?? 0) >= 1);
  assert.ok((scan.usage.get("browser-skill")?.count ?? 0) >= 1);
  assert.ok((scan.usage.get("deploy")?.count ?? 0) >= 1, "leading slash command counts as usage");
  assert.ok(!scan.usage.has("ghost"), "tool output mentions must not count");
  assert.ok(!scan.usage.has("manually"), "user prose must not count");

  const report = runChecks(scan, 30);
  assert.equal(report.findings.filter((f) => f.kind === "unused").length, 0);
  assert.ok(report.monthlyCost > 0);
});

test("codex adapter reports not-detected for empty home", async () => {
  const scan = await codexAdapter.scan({ home: "/nonexistent-home-xyz", cwd: "/tmp", windowDays: 30 });
  assert.equal(scan.detected, false);
  assert.equal(scan.skills.length, 0);
});
