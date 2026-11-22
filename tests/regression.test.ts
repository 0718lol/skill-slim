import assert from "node:assert/strict";
import { test } from "node:test";
import { runChecks } from "../src/core/checks.ts";
import { aggregate } from "../src/core/collect.ts";
import { planFix } from "../src/fix.ts";
import type { AgentReport, AgentScan, Skill, UsageStat } from "../src/types.ts";
import { parseFrontmatter } from "../src/util/frontmatter.ts";
import { renderPage } from "../src/ui.ts";
import { CLIENT_SCRIPT } from "../src/ui-client.ts";

// --- dashboard i18n ---------------------------------------------------------

test("dashboard script is valid JavaScript once embedded in the page", () => {
  const page = renderPage();
  const script = page.split("<script>")[1].split("</script>")[0];
  assert.doesNotThrow(() => new Function(script));
});

test("dashboard ships English and Chinese with identical keys and placeholders", () => {
  const start = CLIENT_SCRIPT.indexOf("var I18N = ") + "var I18N = ".length;
  const end = CLIENT_SCRIPT.indexOf("\n\n  function detectLang");
  const dict = new Function(`return ${CLIENT_SCRIPT.slice(start, end).trim().replace(/;$/, "")}`)() as Record<
    string,
    Record<string, string>
  >;
  assert.deepEqual(Object.keys(dict).sort(), ["en", "zh"]);
  assert.deepEqual(Object.keys(dict.en).sort(), Object.keys(dict.zh).sort());
  const holes = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();
  for (const key of Object.keys(dict.en)) {
    assert.equal(holes(dict.en[key]), holes(dict.zh[key]), `placeholders differ for "${key}"`);
  }
});

test("dashboard shell has no hard-coded user-facing copy", () => {
  const shell = renderPage().split("<script>")[0];
  assert.ok(!/[\u4e00-\u9fff]/.test(shell), "Chinese text found outside the i18n dictionary");
});

function skill(overrides: Partial<Skill>): Skill {
  return {
    agent: "codex",
    name: "sample",
    dirName: "sample",
    description: "A sample skill description",
    body: "Body.",
    path: "/tmp/skills/sample",
    source: "global",
    ...overrides,
  };
}

function scan(overrides: Partial<AgentScan>): AgentScan {
  return {
    id: "codex",
    name: "Codex CLI",
    detected: true,
    skills: [],
    instructions: [],
    usage: new Map(),
    usageAvailable: true,
    conversationCount: 50,
    notes: [],
    ...overrides,
  };
}

function withGate<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.SKILL_SLIM_MIN_CONVERSATIONS;
  if (value === undefined) delete process.env.SKILL_SLIM_MIN_CONVERSATIONS;
  else process.env.SKILL_SLIM_MIN_CONVERSATIONS = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.SKILL_SLIM_MIN_CONVERSATIONS;
    else process.env.SKILL_SLIM_MIN_CONVERSATIONS = prev;
  }
}

// --- frontmatter -----------------------------------------------------------

test("folded block scalar (>-) description is read in full", () => {
  const raw = "---\nname: a\ndescription: >-\n  First line of text\n  continues here.\n---\nbody\n";
  assert.equal(parseFrontmatter(raw).data.description, "First line of text continues here.");
  assert.equal(parseFrontmatter(raw).data.name, "a");
});

test("literal block scalar (|) keeps newlines", () => {
  const raw = "---\ndescription: |\n  line one\n  line two\nname: b\n---\n";
  const { data } = parseFrontmatter(raw);
  assert.equal(data.description, "line one\nline two");
  assert.equal(data.name, "b");
});

test("plain multi-line scalar joins continuation lines", () => {
  const raw = "---\ndescription: Starts here\n  and keeps going\n---\n";
  assert.equal(parseFrontmatter(raw).data.description, "Starts here and keeps going");
});

// --- aggregate --------------------------------------------------------------

function report(overrides: Partial<AgentReport>): AgentReport {
  return {
    id: "codex",
    name: "Codex CLI",
    detected: true,
    skillCount: 0,
    instructionCount: 0,
    alwaysOnTokens: 0,
    billPer1000: 0,
    conversations: 0,
    monthlyCost: 0,
    findings: [],
    score: 100,
    notes: [],
    ...overrides,
  };
}

test("totalRecoverableTokens sums actionable findings, each skill once", () => {
  const r = report({
    skillCount: 3,
    findings: [
      { agent: "codex", kind: "token-bill", severity: "info", title: "", detail: "", paths: [], recoverableTokens: 0 },
      { agent: "codex", kind: "unused", severity: "warn", title: "", detail: "", paths: ["/a"], recoverableTokens: 110 },
      { agent: "codex", kind: "unused", severity: "warn", title: "", detail: "", paths: ["/b"], recoverableTokens: 90 },
      // /a already counted via unused — must not be added twice
      { agent: "codex", kind: "duplicate", severity: "warn", title: "", detail: "", paths: ["/a", "/c"], recoverableTokens: 50 },
      // plugin-bundle noise is not the user's to recover
      { agent: "codex", kind: "unused", severity: "info", title: "", detail: "", paths: ["/p"], recoverableTokens: 999 },
      { agent: "codex", kind: "convention", severity: "warn", title: "", detail: "", paths: ["/b"] },
    ],
  });
  assert.equal(aggregate([report({ detected: false }), r], 30).totalRecoverableTokens, 200);
});

test("headline score ignores agents that carry nothing", () => {
  const agg = aggregate(
    [
      report({ id: "codex", skillCount: 40, score: 70 }),
      report({ id: "opencode", score: 100 }),
      report({ id: "copilot-cli", score: 100 }),
    ],
    30,
  );
  assert.equal(agg.score, 70);
});

test("headline score is weighted by what each agent carries", () => {
  const agg = aggregate(
    [report({ id: "codex", skillCount: 39, instructionCount: 1, score: 70 }), report({ id: "gemini-cli", skillCount: 1, score: 100 })],
    30,
  );
  // (70*40 + 100*1) / 41 ≈ 70.7
  assert.equal(agg.score, 71);
});

// --- checks -----------------------------------------------------------------

test("large plugin-bundled bodies are informational and do not cost score", () => {
  const big = "x\n".repeat(600);
  const r = runChecks(scan({ usageAvailable: false, skills: [skill({ source: "plugin", body: big })] }));
  const finding = r.findings.find((f) => f.kind === "convention");
  assert.equal(finding?.severity, "info");
  assert.equal(r.score, 100);
});

test("usage recorded under the folder name counts for a renamed skill", () => {
  const usage = new Map<string, UsageStat>([["my-folder", { count: 2 }]]);
  const s = scan({ usage, skills: [skill({ name: "pretty-name", dirName: "my-folder" })] });
  withGate(undefined, () => {
    assert.equal(runChecks(s).findings.filter((f) => f.kind === "unused").length, 0);
    assert.equal(planFix([s]).length, 0);
  });
});

test("too few conversations: no unused findings, no quarantine plan, a note instead", () => {
  const s = scan({ conversationCount: 4, skills: [skill({})] });
  withGate(undefined, () => {
    const r = runChecks(s);
    assert.equal(r.findings.filter((f) => f.kind === "unused").length, 0);
    assert.ok(r.notes.some((n) => n.includes("only 4 conversation")));
    assert.equal(planFix([s]).length, 0);
  });
  withGate(undefined, () => {
    const enough = scan({ conversationCount: 5, skills: [skill({})] });
    assert.equal(runChecks(enough).findings.filter((f) => f.kind === "unused").length, 1);
    assert.equal(planFix([enough]).length, 1);
  });
});
