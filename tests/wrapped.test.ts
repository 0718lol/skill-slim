import assert from "node:assert/strict";
import { test } from "node:test";
import { renderWrappedHtml } from "../src/core/wrapped.ts";
import type { AgentScan, Report, Skill, UsageStat } from "../src/types.ts";

function skill(name: string, source: Skill["source"] = "global"): Skill {
  return {
    agent: "claude-code",
    name,
    dirName: name,
    description: `does ${name}`,
    body: "body",
    path: `/tmp/${name}`,
    source,
  };
}

function scan(overrides: Partial<AgentScan>): AgentScan {
  return {
    id: "claude-code",
    name: "Claude Code",
    detected: true,
    skills: [skill("alpha"), skill("beta"), skill("ghost")],
    instructions: [],
    usage: new Map<string, UsageStat>([
      ["alpha", { count: 6 }],
      ["beta", { count: 3 }],
    ]),
    usageAvailable: true,
    conversationCount: 12,
    notes: [],
    ...overrides,
  };
}

function report(overrides: Partial<Report>): Report {
  return {
    generatedAt: "2026-10-26T12:00:00.000Z",
    windowDays: 30,
    agents: [],
    totalAlwaysOnTokens: 529,
    totalBillPer1000: 1.59,
    totalMonthlyCost: 0.42,
    totalRecoverableTokens: 120,
    score: 90,
    ...overrides,
  };
}

test("wrapped bill renders leaderboard, sleepers and per-agent chips", () => {
  const html = renderWrappedHtml(report({}), [scan({})]);
  assert.match(html, /技能账单/);
  assert.match(html, /最常调用的技能/);
  assert.match(html, /alpha/);
  assert.match(html, /6 次/);
  assert.match(html, /沉睡名单/);
  assert.match(html, /1 个你自己的技能/); // ghost is unused and user-owned
  assert.match(html, /综合健康分/);
  assert.ok(html.includes("90"));
  assert.match(html, /12<\/div><div class="k">次对话/);
});

test("wrapped bill aggregates the same skill across agents", () => {
  const claude = scan({});
  const codex = scan({
    id: "codex",
    name: "Codex CLI",
    skills: [skill("alpha")],
    conversationCount: 5,
  });
  const html = renderWrappedHtml(report({}), [claude, codex]);
  assert.match(html, /alpha/);
  assert.match(html, /12 次/); // 6 + 6 across two agents
  assert.match(html, /claude-code \/ codex/);
});

test("wrapped bill says so honestly when no usage is parseable", () => {
  const html = renderWrappedHtml(report({}), [
    scan({ usage: new Map(), usageAvailable: false, conversationCount: 0 }),
  ]);
  assert.match(html, /没有可解析的调用记录/);
  assert.ok(!html.includes("次 ·"));
});

test("wrapped bill escapes skill names", () => {
  const html = renderWrappedHtml(report({}), [
    scan({ skills: [skill('<img src="x">&')], usage: new Map([["<img src=\"x\">&", { count: 2 }]]) }),
  ]);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img src=&quot;x&quot;&gt;&amp;"));
});
