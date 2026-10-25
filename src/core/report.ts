import * as fs from "node:fs";
import type { AgentReport, Finding, Report } from "../types.ts";
import { grade } from "./checks.ts";
import { fmtUsd } from "../util/tokens.ts";

const SEVERITY_ICON: Record<Finding["severity"], string> = {
  error: "✖",
  warn: "▲",
  info: "·",
};

export function renderTerminal(report: Report, opts?: { verbose?: boolean }): string {
  const verbose = opts?.verbose ?? false;
  const out: string[] = [];
  out.push("");
  out.push(`  skill-slim — agent context health check`);
  out.push(`  scanned: ${report.agents.filter((a) => a.detected).length}/${report.agents.length} agents installed · usage window ${report.windowDays}d`);
  out.push("");

  for (const agent of report.agents) {
    if (!agent.detected) {
      out.push(`  ○ ${agent.name} — not installed, skipped`);
      continue;
    }
    out.push(`  ● ${agent.name}  [${agent.id}]`);
    out.push(
      `    skills: ${agent.skillCount} · always-on instructions: ${agent.instructionCount} · ` +
        `always-on tokens: ~${agent.alwaysOnTokens.toLocaleString()} · ` +
        `≈ ${fmtUsd(agent.billPer1000)} per 1k conversations`,
    );
    if (agent.conversations > 0) {
      out.push(
        `    ≈ ${fmtUsd(agent.monthlyCost)}/month at this pace ` +
          `(${agent.conversations} conversation${agent.conversations === 1 ? "" : "s"} in ${report.windowDays}d)`,
      );
    }
    for (const note of agent.notes) {
      out.push(`    · ${note}`);
    }
    if (agent.findings.length === 0) {
      out.push(`    ✓ no issues found`);
    }

    // Keep the report scannable: warn/error findings always show; plugin-
    // bundled informational noise collapses into a summary line.
    const actionable: Finding[] = [];
    const infoDupes: Finding[] = [];
    const infoOthers: Finding[] = [];
    for (const f of agent.findings) {
      if (f.severity !== "info") actionable.push(f);
      else if (f.kind === "duplicate") infoDupes.push(f);
      else infoOthers.push(f);
    }
    infoDupes.sort((a, b) => (b.recoverableTokens ?? 0) - (a.recoverableTokens ?? 0));
    const shown = verbose
      ? [...actionable, ...infoDupes, ...infoOthers]
      : [...actionable, ...infoDupes.slice(0, 3)];
    const hiddenCount = verbose ? 0 : infoOthers.length + (infoDupes.length - Math.min(3, infoDupes.length));

    for (const f of shown) {
      out.push(`    ${SEVERITY_ICON[f.severity]} ${f.title}`);
      out.push(`      ${f.detail}`);
      if (f.recoverableTokens && f.recoverableTokens > 0) {
        out.push(`      recoverable: ~${f.recoverableTokens.toLocaleString()} tokens`);
      }
      for (const p of f.paths.slice(0, 2)) {
        out.push(`      ${dim(p)}`);
      }
    }
    if (hiddenCount > 0 && !verbose) {
      out.push(`    · ${hiddenCount} informational finding(s) hidden (--verbose to show)`);
    }
    if (agent.findings.length > 0 && agent.findings.every((f) => f.severity === "info") && hiddenCount === 0) {
      out.push(`    ✓ nothing actionable — informational notes above`);
    }
    out.push(`    health score: ${agent.score}/100 (${grade(agent.score)})`);
    out.push("");
  }

  out.push(`  ──────────────────────────────────────────`);
  out.push(
    `  overall score: ${report.score}/100 (${grade(report.score)}) · ` +
      `always-on everywhere: ~${report.totalAlwaysOnTokens.toLocaleString()} tokens · ` +
      `recoverable: ~${report.totalRecoverableTokens.toLocaleString()} tokens` +
      (report.totalMonthlyCost > 0 ? ` · ≈ ${fmtUsd(report.totalMonthlyCost)}/month wasted` : ``),
  );
  out.push(`  fix suggestions: run \`skill-slim fix\` (dry-run by default) · \`skill-slim restore\` to un-quarantine`);
  out.push("");
  return out.join("\n");

  function dim(s: string): string {
    return s;
  }
}

export function toJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export function renderHtml(report: Report): string {
  const agentCards = report.agents.map(agentCard).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>skill-slim · 体检报告</title>
<style>
  :root{
    --paper:#f6f1e7; --paper2:#efe7d6; --card:#fffdf8; --line:#e6dbc6;
    --ink:#3d3229; --ink-soft:#8a7a68;
    --walnut:#6d4f39; --walnut-deep:#54402f; --oak:#a98362;
    --sage:#7f9271; --sage-bg:#eef2e6;
    --amber:#b98a24; --amber-bg:#f7eed7;
    --terra:#bd5b49; --terra-bg:#f8e7e2;
    --muted-bg:#f1ece0;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color:var(--ink);background:
      radial-gradient(1100px 500px at 15% -5%, #fdfaf3 0%, transparent 60%),
      linear-gradient(180deg,var(--paper) 0%,var(--paper2) 100%);
    background-attachment:fixed;min-height:100vh;
  }
  header{
    background:
      repeating-linear-gradient(93deg, rgba(255,255,255,.045) 0 2px, transparent 2px 9px),
      linear-gradient(135deg,var(--walnut) 0%,var(--walnut-deep) 100%);
    color:#f6ecdd;padding:24px 32px;
    display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;
    box-shadow:0 4px 18px rgba(84,64,47,.25);
  }
  .logo{font-family:Georgia,"Songti SC",serif;font-size:24px;letter-spacing:.5px}
  .logo b{color:#e8c894}
  .when{color:#e3d3bd;font-size:13px}
  main{max-width:1020px;margin:0 auto;padding:28px 24px 48px}

  .hero{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:26px}
  .hero-card{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:22px 26px;display:flex;align-items:center;gap:22px;
    box-shadow:0 10px 26px rgba(74,55,40,.08);flex:1;min-width:300px;
  }
  .ring-wrap{position:relative;width:112px;height:112px;flex:none}
  .ring-wrap.small{width:64px;height:64px}
  .ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring-num b{font-family:Georgia,serif;font-size:30px;line-height:1}
  .ring-num.small b{font-size:19px}
  .ring-num span{font-size:11px;color:var(--ink-soft);margin-top:3px}
  .hero-title{font-family:Georgia,"Songti SC",serif;font-size:19px;margin-bottom:6px}
  .hero-sub{color:var(--ink-soft);font-size:13px;line-height:1.7}
  .stat-tiles{display:flex;gap:14px;flex:2;min-width:300px;flex-wrap:wrap}
  .tile{
    flex:1;min-width:130px;background:var(--card);border:1px solid var(--line);
    border-radius:18px;padding:16px 18px;box-shadow:0 10px 26px rgba(74,55,40,.08);
    display:flex;flex-direction:column;justify-content:center;
  }
  .tile .v{font-family:Georgia,serif;font-size:22px;margin:4px 0 2px}
  .tile .k{font-size:12px;color:var(--ink-soft)}
  .tile .v.money{color:var(--amber)}
  .tile .v.recover{color:var(--sage)}

  .section-title{
    font-family:Georgia,"Songti SC",serif;font-size:18px;margin:28px 0 14px;
    display:flex;align-items:center;gap:14px;color:var(--ink);
  }
  .section-title::after{content:"";flex:1;height:1px;background:var(--line)}

  .agent{background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:18px 24px;margin-bottom:14px;box-shadow:0 10px 26px rgba(74,55,40,.08)}
  .agent-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .agent-name{font-family:Georgia,"Songti SC",serif;font-size:18px}
  .agent-id{color:var(--ink-soft);font-size:12px;font-family:ui-monospace,Menlo,monospace}
  .agent-head .ring-wrap{margin-left:auto}
  .agent-skip{color:var(--ink-soft);padding:10px 24px}
  .agent-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .chip{
    font-size:12px;padding:4px 11px;border-radius:999px;background:var(--muted-bg);
    color:#6b5c4c;border:1px solid var(--line);
  }
  .chip.money{background:var(--amber-bg);color:var(--amber);border-color:#ecdcb4}
  .finding{border-top:1px dashed var(--line);padding:10px 2px;font-size:13px;line-height:1.55}
  .finding:first-of-type{border-top:none}
  .f-title{font-weight:600;display:flex;gap:8px;align-items:baseline}
  .sev-error{color:var(--terra)} .sev-warn{color:var(--amber)} .sev-info{color:var(--ink-soft)}
  .f-detail{color:var(--ink-soft);margin-top:2px}
  .f-path{color:#b0a08c;font-size:11px;word-break:break-all;margin-top:2px;font-family:ui-monospace,Menlo,monospace}
  .f-save{color:var(--sage);font-size:12px;margin-top:2px}
  .clean{color:var(--sage);background:var(--sage-bg);border-radius:12px;padding:10px 14px;font-size:13px}
  .notes{color:#b0a08c;font-size:12px;line-height:1.7;margin-top:10px}
  details.more{border-top:1px dashed var(--line);padding-top:4px}
  details.more summary{
    list-style:none;cursor:pointer;color:var(--oak);font-size:12px;padding:8px 0;font-family:inherit;
  }
  details.more summary::-webkit-details-marker{display:none}
  details.more summary::before{content:"▸ ";display:inline-block;transition:transform .15s}
  details.more[open] summary::before{transform:rotate(90deg)}
  details.more[open] summary{color:var(--ink-soft)}

  footer{color:var(--ink-soft);font-size:12px;line-height:1.8;margin-top:26px;
    border-top:1px solid var(--line);padding-top:14px}
  footer code{font-family:ui-monospace,Menlo,monospace;background:var(--muted-bg);
    border-radius:6px;padding:1px 6px;font-size:11px;color:#6b5c4c}

  @media print{
    body{background:#fff}
    header{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .agent,.hero-card,.tile{box-shadow:none;break-inside:avoid}
    details.more{display:block}
    details.more .finding{display:block !important}
  }
</style></head>
<body>
<header>
  <span class="logo">skill-<b>slim</b> · 体检报告</span>
  <span class="when">${esc(fmtWhen(report.generatedAt))} · 统计窗口 ${report.windowDays} 天 · 检出 ${report.agents.filter((a) => a.detected).length}/${report.agents.length} 个 Agent</span>
</header>
<main>
  <div class="hero">
    <div class="hero-card">
      ${ring(report.score, 112, false)}
      <div>
        <div class="hero-title">综合健康分 · ${grade(report.score)} 级</div>
        <div class="hero-sub">
          每轮对话都要携带的常驻上下文共 ~${report.totalAlwaysOnTokens.toLocaleString()} tokens；<br>
          按当前用量节奏，每月约 ${esc(fmtUsd(report.totalMonthlyCost))}。
        </div>
      </div>
    </div>
    <div class="stat-tiles">
      <div class="tile"><span class="k">常驻 tokens</span><span class="v">~${report.totalAlwaysOnTokens.toLocaleString()}</span><span class="k">every turn</span></div>
      <div class="tile"><span class="k">每千次对话</span><span class="v money">${esc(fmtUsd(report.totalBillPer1000))}</span><span class="k">always-on 账单</span></div>
      <div class="tile"><span class="k">每月成本</span><span class="v money">${esc(fmtUsd(report.totalMonthlyCost))}</span><span class="k">按观测节奏</span></div>
      <div class="tile"><span class="k">可回收</span><span class="v recover">~${report.totalRecoverableTokens.toLocaleString()}</span><span class="k">tokens</span></div>
    </div>
  </div>

  <div class="section-title">各 Agent 体检结果</div>
  ${agentCards}

  <footer>
    估算说明：token 为启发式计数（CJK ≈ 1 token/字符，其余 ≈ 3.8 字符/token），成本按 $3/M input tokens 计。<br>
    下一步：<code>skill-slim fix</code> 预览瘦身方案（默认 dry-run）· <code>skill-slim restore</code> 恢复被隔离的技能 · 报告由 skill-slim 在本地生成，无任何网络请求。
  </footer>
</main>
</body></html>`;

  function ring(score: number, size: number, small: boolean): string {
    const r = size / 2 - (small ? 5 : 7);
    const c = 2 * Math.PI * r;
    const col = scoreColor(score);
    const w = small ? 6 : 8;
    return `<div class="ring-wrap${small ? " small" : ""}">
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#ece2cf" stroke-width="${w}"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
</svg>
<div class="ring-num${small ? " small" : ""}"><b style="color:${col}">${score}</b>${small ? "" : "<span>健康分</span>"}</div>
</div>`;
  }

  function scoreColor(score: number): string {
    return score >= 92 ? "var(--sage)" : score >= 78 ? "var(--amber)" : score >= 60 ? "#c07a35" : "var(--terra)";
  }

  function agentCard(a: AgentReport): string {
    if (!a.detected) {
      return `<div class="agent"><div class="agent-skip">○ ${esc(a.name)} — 未安装，已跳过</div></div>`;
    }
    const actionable = a.findings.filter((f) => f.severity !== "info");
    const info = a.findings.filter((f) => f.severity === "info");
    return `<div class="agent">
  <div class="agent-head">
    <div><span class="agent-name">${esc(a.name)}</span> <span class="agent-id">${a.id}</span></div>
    ${ring(a.score, 64, true)}
  </div>
  <div class="agent-stats">
    <span class="chip">${a.skillCount} 个技能</span>
    <span class="chip">${a.instructionCount} 份常驻指令</span>
    <span class="chip">常驻 ~${a.alwaysOnTokens.toLocaleString()} tokens</span>
    <span class="chip money">${esc(fmtUsd(a.billPer1000))} / 千次对话</span>
    ${a.conversations > 0 ? `<span class="chip money">${esc(fmtUsd(a.monthlyCost))} / 月 · ${a.conversations} 次对话</span>` : ""}
  </div>
  ${a.findings.length === 0 ? `<div class="clean">✓ 一切正常，没有发现问题</div>` : ""}
  ${actionable.map(findingHtml).join("\n  ")}
  ${actionable.length === 0 && info.length > 0 ? `<div class="clean">✓ 没有需要动手的问题</div>` : ""}
  ${info.length > 0 ? `<details class="more"><summary>展开 ${info.length} 条提示（插件捆绑技能等）</summary>${info.map(findingHtml).join("")}</details>` : ""}
  ${a.notes.length ? `<div class="notes">${a.notes.map(esc).join("<br>")}</div>` : ""}
</div>`;
  }

  function findingHtml(f: Finding): string {
    const icon = f.severity === "error" ? "✖" : f.severity === "warn" ? "▲" : "·";
    return `<div class="finding">
  <div class="f-title"><span class="sev-${f.severity}">${icon}</span>${esc(f.title)}</div>
  <div class="f-detail">${esc(f.detail)}</div>
  ${f.paths.slice(0, 2).map((p) => `<div class="f-path">${esc(p)}</div>`).join("")}
  ${f.recoverableTokens && f.recoverableTokens > 0 ? `<div class="f-save">可回收 ~${f.recoverableTokens.toLocaleString()} tokens</div>` : ""}
</div>`;
  }

  function fmtWhen(iso: string): string {
    // Date + minute cut from the ISO string, not toLocaleString: the report is a
    // shareable file, so the timestamp must not depend on the generator's locale.
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
    return m ? `${m[1]} ${m[2]}` : iso;
  }
}

export function writeReportFile(path: string, content: string): void {
  fs.writeFileSync(path, content, "utf8");
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
