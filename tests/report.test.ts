import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTerminal } from "../src/core/report.ts";
import type { AgentReport, Finding, Report } from "../src/types.ts";

function finding(overrides: Partial<Finding>): Finding {
  return {
    agent: "claude-code",
    kind: "unused",
    severity: "warn",
    title: "sample finding",
    detail: "detail text",
    paths: [],
    recoverableTokens: 40,
    ...overrides,
  };
}

function reportOf(findings: Finding[]): Report {
  const agent: AgentReport = {
    id: "claude-code",
    name: "Claude Code",
    detected: true,
    skillCount: 2,
    instructionCount: 1,
    alwaysOnTokens: 500,
    billPer1000: 1.5,
    conversations: 10,
    monthlyCost: 0.05,
    findings,
    score: 88,
    notes: [],
  };
  return {
    generatedAt: "2026-08-30T00:00:00.000Z",
    windowDays: 30,
    agents: [agent],
    totalAlwaysOnTokens: 500,
    totalBillPer1000: 1.5,
    totalMonthlyCost: 0.05,
    totalRecoverableTokens: 0,
    score: 88,
  };
}

test("actionable findings always show, informational ones collapse by default", () => {
  const report = reportOf([
    finding({ severity: "warn", title: "UNUSED SKILL" }),
    finding({ severity: "info", kind: "unused", title: "PLUGIN SKILL NEVER USED" }),
    finding({ severity: "info", kind: "convention", title: "NAME MISMATCH" }),
  ]);
  const output = renderTerminal(report);
  assert.ok(output.includes("UNUSED SKILL"));
  assert.ok(!output.includes("PLUGIN SKILL NEVER USED"));
  assert.ok(!output.includes("NAME MISMATCH"));
  assert.ok(output.includes("2 informational finding(s) hidden"));

  const verbose = renderTerminal(report, { verbose: true });
  assert.ok(verbose.includes("PLUGIN SKILL NEVER USED"));
  assert.ok(verbose.includes("NAME MISMATCH"));
});

test("plugin duplicate piles show top 3 with a hidden-count summary", () => {
  const dupes = Array.from({ length: 8 }, (_, i) =>
    finding({
      kind: "duplicate",
      severity: "info",
      title: `DUP ${i}`,
      recoverableTokens: 100 - i,
    }),
  );
  const output = renderTerminal(reportOf(dupes));
  assert.ok(output.includes("DUP 0"));
  assert.ok(output.includes("DUP 2"));
  assert.ok(!output.includes("DUP 3"));
  assert.ok(output.includes("5 informational finding(s) hidden"));
});

test("clean report shows the no-issues line", () => {
  const output = renderTerminal(reportOf([]));
  assert.ok(output.includes("no issues found"));
});
