import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGates, runChecks } from "../src/core/checks.ts";
import type { AgentScan, Skill } from "../src/types.ts";

function skill(overrides: Partial<Skill>): Skill {
  return {
    agent: "claude-code",
    name: "sample",
    dirName: "sample",
    description: "A sample skill description",
    body: "Body.",
    path: "/tmp/sample/SKILL.md",
    source: "global",
    ...overrides,
  };
}

function scan(overrides: Partial<AgentScan>): AgentScan {
  return {
    id: "claude-code",
    name: "Claude Code",
    detected: true,
    skills: [],
    instructions: [],
    usage: new Map(),
    usageAvailable: false,
    conversationCount: 0,
    notes: [],
    ...overrides,
  };
}

test("clean scan scores 100 with no findings", () => {
  const report = runChecks(scan({}));
  assert.equal(report.score, 100);
  assert.equal(report.findings.length, 0);
});

test("duplicate descriptions produce a duplicate finding", () => {
  const report = runChecks(
    scan({
      skills: [
        skill({ name: "alpha", description: "Review pull requests and suggest code improvements" }),
        skill({ name: "beta", description: "Review pull requests and suggest code review improvements" }),
      ],
    }),
  );
  const dups = report.findings.filter((f) => f.kind === "duplicate");
  assert.equal(dups.length, 1);
  assert.ok(dups[0].title.includes("alpha"));
  assert.ok(dups[0].title.includes("beta"));
  assert.ok(report.score < 100);
});

test("unused skills are only flagged when usage data exists", () => {
  const skills = [skill({ name: "ghost", description: "Never used skill" })];
  const withUsage = runChecks(scan({ skills, usageAvailable: true, usage: new Map() }));
  const withoutUsage = runChecks(scan({ skills, usageAvailable: false }));
  assert.equal(withUsage.findings.filter((f) => f.kind === "unused").length, 1);
  assert.equal(withoutUsage.findings.filter((f) => f.kind === "unused").length, 0);
});

test("missing description is an error, name mismatch is informational", () => {
  const report = runChecks(
    scan({
      skills: [skill({ name: "renamed", dirName: "nodesc", description: "" })],
    }),
  );
  const kinds = report.findings.map((f) => `${f.kind}:${f.severity}`);
  assert.ok(kinds.includes("convention:error"));
  assert.ok(kinds.includes("convention:info"));
});

test("oversized body triggers progressive-disclosure warning", () => {
  const report = runChecks(scan({ skills: [skill({ body: "line\n".repeat(600) })] }));
  assert.ok(report.findings.some((f) => f.severity === "warn" && f.title.includes("body is large")));
});

test("always-on token bill is reported", () => {
  const report = runChecks(
    scan({
      skills: [skill({ description: "x".repeat(400) })],
      instructions: [{ agent: "claude-code", label: "global CLAUDE.md", path: "/x", content: "y".repeat(2000) }],
    }),
  );
  const bills = report.findings.filter((f) => f.kind === "token-bill");
  assert.equal(bills.length, 1);
  assert.ok(report.alwaysOnTokens > 500);
  assert.ok(report.billPer1000 > 0);
});

test("monthly cost scales with observed conversations", () => {
  const report = runChecks(
    scan({ skills: [skill({})], usageAvailable: true, conversationCount: 100 }),
    30,
  );
  assert.equal(report.conversations, 100);
  assert.ok(report.monthlyCost > 0);
  const twice = runChecks(
    scan({ skills: [skill({})], usageAvailable: true, conversationCount: 200 }),
    30,
  );
  assert.ok(Math.abs(twice.monthlyCost - report.monthlyCost * 2) < 1e-9);
});

test("plugin-bundled issues are informational and not quarantineable", () => {
  const skills = [
    skill({ name: "mine", source: "global", description: "Never used skill of mine" }),
    skill({ name: "bundled-a", source: "plugin", description: "Bundled never used skill alpha" }),
    skill({ name: "bundled-b", source: "plugin", description: "Bundled never used skill beta" }),
  ];
  const report = runChecks(scan({ skills, usageAvailable: true, usage: new Map() }));
  const unusedMine = report.findings.filter((f) => f.kind === "unused" && f.title.includes("mine"));
  const unusedBundled = report.findings.filter((f) => f.kind === "unused" && f.title.includes("bundled"));
  assert.equal(unusedMine.length, 1);
  assert.equal(unusedMine[0].severity, "warn");
  assert.equal(unusedBundled.length, 2);
  assert.ok(unusedBundled.every((f) => f.severity === "info"));

  // two bundled skills with identical descriptions → info, not warn
  const dupReport = runChecks(
    scan({
      skills: [
        skill({ name: "p-a", source: "plugin", description: "Same bundled purpose" }),
        skill({ name: "p-b", source: "plugin", description: "Same bundled purpose" }),
      ],
    }),
  );
  assert.equal(dupReport.findings.filter((f) => f.kind === "duplicate")[0].severity, "info");
});

test("undetected agent scores 100 without findings", () => {
  const report = runChecks(scan({ detected: false, skills: [skill({})] }));
  assert.equal(report.detected, false);
  assert.equal(report.score, 100);
});

test("gates pass quietly and fail with one message per violated gate", () => {
  const healthy = { score: 95, totalAlwaysOnTokens: 500 };
  assert.deepEqual(evaluateGates(healthy, { minScore: 85, maxAlwaysOnTokens: 1000 }), []);

  const failing = { score: 70, totalAlwaysOnTokens: 4500 };
  const failures = evaluateGates(failing, { minScore: 85, maxAlwaysOnTokens: 3000 });
  assert.equal(failures.length, 2);
  assert.ok(failures[0].includes("--min-score"));
  assert.ok(failures[1].includes("--max-always-on-tokens"));

  // unset gates never fail, even on a terrible report
  assert.deepEqual(evaluateGates(failing, {}), []);
});
