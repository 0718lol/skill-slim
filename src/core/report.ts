import * as fs from "node:fs";
import type { Finding, Report } from "../types.ts";
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
  const cards = report.agents
    .filter((a) => a.detected)
    .map(
      (a) => `
    <div class="card">
      <div class="head"><h2>${esc(a.name)}</h2><span class="score ${gradeClass(a.score)}">${a.score}</span></div>
      <p class="meta">${a.skillCount} skills · ~${a.alwaysOnTokens.toLocaleString()} always-on tokens · ${esc(fmtUsd(a.billPer1000))}/1k convos${a.conversations > 0 ? ` · ${esc(fmtUsd(a.monthlyCost))}/mo at this pace` : ""}</p>
      <ul>
        ${a.findings.map((f) => `<li class="${f.severity}"><b>${esc(f.title)}</b><br>${esc(f.detail)}</li>`).join("\n        ")}
      </ul>
      ${a.notes.length ? `<p class="meta">${a.notes.map(esc).join(" · ")}</p>` : ""}
    </div>`,
    )
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>skill-slim report</title>
<style>
  body{font-family:-apple-system,Segoe UI,sans-serif;background:#0d1117;color:#e6edf3;max-width:860px;margin:0 auto;padding:40px 24px}
  h1{font-size:26px}
  .score{font-size:28px;font-weight:700;border-radius:10px;padding:4px 14px}
  .scoreA{background:#1a7f37}.scoreB{background:#9e6a03}.scoreC{background:#b35900}.scoreD{background:#b62324}
  .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px 24px;margin:16px 0}
  .head{display:flex;justify-content:space-between;align-items:center}
  h2{margin:0;font-size:20px}
  ul{list-style:none;padding:0}
  li{padding:8px 0;border-top:1px solid #21262d;line-height:1.5}
  li.error{color:#f85149}li.warn{color:#d29922}li.info{color:#8b949e}
  .meta{color:#8b949e;font-size:13px}
</style></head><body>
<h1>skill-slim report</h1>
<p class="meta">generated ${esc(report.generatedAt)} · overall score ${report.score} (${grade(report.score)}) · recoverable ~${report.totalRecoverableTokens.toLocaleString()} tokens</p>
${cards}
<p class="meta">Estimates only: token counts are heuristic and pricing assumes $${3}/M input tokens.</p>
</body></html>`;

  function gradeClass(score: number): string {
    return `score${grade(score)}`;
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
