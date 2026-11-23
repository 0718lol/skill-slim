import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLang, translate, ZH_RULES, zhRulesForClient } from "../src/i18n.ts";
import { renderHtml } from "../src/core/report.ts";
import type { Report } from "../src/types.ts";

const CJK = /[\u4e00-\u9fff]/;

function report(): Report {
  return {
    generatedAt: "2026-11-22T12:00:00.000Z",
    windowDays: 30,
    score: 88,
    totalAlwaysOnTokens: 1234,
    totalBillPer1000: 3.7,
    totalMonthlyCost: 0.5,
    totalRecoverableTokens: 200,
    agents: [
      {
        id: "codex",
        name: "Codex CLI",
        detected: true,
        score: 88,
        skillCount: 1,
        instructionCount: 1,
        alwaysOnTokens: 1234,
        billPer1000: 3.7,
        monthlyCost: 0.5,
        conversations: 12,
        findings: [
          {
            agent: "codex",
            kind: "unused",
            severity: "warn",
            title: '"alpha" (global) never invoked in the scan window',
            detail: "Its description still rides along in every conversation. Consider quarantining it.",
            paths: ["/home/u/.codex/skills/alpha"],
            recoverableTokens: 200,
          },
        ],
        notes: ["parsed 12 session file(s) from the last 30 days"],
      },
      { id: "cursor", name: "Cursor", detected: false, score: 100, skillCount: 0, instructionCount: 0,
        alwaysOnTokens: 0, billPer1000: 0, monthlyCost: 0, conversations: 0, findings: [], notes: [] },
    ],
  } as unknown as Report;
}

test("HTML report is English by default, with no Chinese anywhere", () => {
  const html = renderHtml(report());
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Overall health: B/);
  assert.match(html, /1 skill</);
  assert.match(html, /never invoked in the scan window/);
  assert.match(html, /Cursor — not installed, skipped/);
  assert.ok(!CJK.test(html));
});

test("HTML report in Chinese translates chrome, findings and notes", () => {
  const html = renderHtml(report(), "zh");
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /综合健康分 · B 级/);
  assert.match(html, /「alpha」（全局）在扫描窗口内从未被调用/);
  assert.match(html, /它的描述仍在每次对话里常驻，建议隔离。/);
  assert.match(html, /解析了最近 30 天的 12 个会话文件/);
  assert.ok(!html.includes("never invoked in the scan window"));
});

test("translate passes unknown text through and leaves English alone", () => {
  assert.equal(translate("title", "something brand new", "zh"), "something brand new");
  assert.equal(translate("note", "parsed 3 session file(s) from the last 7 days", "en"),
    "parsed 3 session file(s) from the last 7 days");
  assert.equal(
    translate("detail", "instructions ~10 tok + 2 skill descriptions ~5 tok", "zh"),
    "指令文件约 10 tok + 2 个技能描述约 5 tok",
  );
  assert.equal(
    translate("detail", "instructions ~10 tok + 2 skill descriptions ~5 tok; heaviest: a, b", "zh"),
    "指令文件约 10 tok + 2 个技能描述约 5 tok；最重的：a, b",
  );
});

test("every Chinese template only references capture groups its regex has", () => {
  for (const [re, tpl] of [...ZH_RULES.title, ...ZH_RULES.detail, ...ZH_RULES.note]) {
    const groups = new RegExp(`${re.source}|`).exec("")!.length - 1;
    for (const m of tpl.matchAll(/\$(\d)/g)) {
      assert.ok(Number(m[1]) <= groups, `${re} has ${groups} groups but template uses $${m[1]}`);
    }
  }
});

test("client copy of the rules is script-safe JSON that round-trips", () => {
  const json = zhRulesForClient();
  assert.ok(!json.includes("<"));
  const data = JSON.parse(json);
  assert.equal(data.title.length, ZH_RULES.title.length);
  for (const [source, flags] of data.title) assert.doesNotThrow(() => new RegExp(source, flags));
});

test("detectLang: flag > SKILL_SLIM_LANG > locale variables > English", () => {
  assert.equal(detectLang("zh", { LANG: "en_US.UTF-8" }), "zh");
  assert.equal(detectLang(undefined, { SKILL_SLIM_LANG: "zh-CN", LANG: "en_US.UTF-8" }), "zh");
  assert.equal(detectLang(undefined, { LANG: "zh_CN.UTF-8" }), "zh");
  assert.equal(detectLang(undefined, { LC_ALL: "en_GB.UTF-8", LANG: "zh_CN.UTF-8" }), "en");
  assert.equal(detectLang(undefined, { LANG: "de_DE.UTF-8" }), "en");
  assert.equal(detectLang(undefined, { LANG: "fr_FR.UTF-8", SKILL_SLIM_LANG: "klingon" }), "en");
});
