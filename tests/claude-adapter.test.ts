import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeCodeAdapter } from "../src/adapters/claude-code.ts";
import { runChecks } from "../src/core/checks.ts";
import * as path from "node:path";

const fixtureHome = path.join(import.meta.dirname!, "fixtures", "claude-home");

test("claude adapter discovers skills, plugins, instructions and usage", async () => {
  const scan = await claudeCodeAdapter.scan({ home: fixtureHome, cwd: fixtureHome, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.equal(scan.usageAvailable, true);

  const names = scan.skills.map((s) => s.name).sort();
  assert.deepEqual(names, ["alpha", "beta", "ghost", "plugskill", "renamed"]);

  const alpha = scan.skills.find((s) => s.name === "alpha")!;
  assert.equal(alpha.source, "global");
  assert.ok(alpha.description.includes("pull requests"));

  const plugskill = scan.skills.find((s) => s.name === "plugskill")!;
  assert.equal(plugskill.source, "plugin");

  assert.ok(scan.instructions.some((f) => f.label === "global CLAUDE.md"));
  assert.ok((scan.usage.get("alpha")?.count ?? 0) >= 1);
  assert.ok(!scan.usage.has("ghost"));

  const report = runChecks(scan);
  assert.ok(report.findings.some((f) => f.kind === "duplicate"));
  assert.ok(report.findings.some((f) => f.kind === "unused"));
  assert.ok(report.findings.some((f) => f.kind === "convention" && f.severity === "error"));
  assert.ok(report.score < 100);
});

test("claude adapter reports not-detected for empty home", async () => {
  const scan = await claudeCodeAdapter.scan({ home: "/nonexistent-home-xyz", cwd: "/tmp", windowDays: 30 });
  assert.equal(scan.detected, false);
  assert.equal(scan.skills.length, 0);
});
