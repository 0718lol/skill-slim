import type { AgentScan, Report } from "../types.ts";
import { grade } from "./checks.ts";
import { fmtUsd } from "../util/tokens.ts";

/**
 * `skill-slim wrapped` — a Spotify-Wrapped-style shareable bill for your
 * agent skills: most-invoked leaderboard, never-invoked count, always-on
 * cost and per-agent score cards, in the same wood & paper brand as the
 * health report. Zero JS, self-contained, print-friendly.
 */
export function renderWrappedHtml(report: Report, scans: AgentScan[]): string {
  const detected = scans.filter((s) => s.detected);
  const totalConversations = detected.reduce((sum, s) => sum + s.conversationCount, 0);

  // aggregate invocation counts across agents; usage maps are keyed lowercase,
  // recover the original casing from the skill lists
  const display = new Map<string, string>();
  for (const scan of detected) {
    for (const skill of scan.skills) display.set(skill.name.toLowerCase(), skill.name);
  }
  const totals = new Map<string, { count: number; agents: Set<string> }>();
  for (const scan of detected) {
    for (const [name, stat] of scan.usage) {
      if (stat.count <= 0) continue;
      const entry = totals.get(name) ?? { count: 0, agents: new Set<string>() };
      entry.count += stat.count;
      entry.agents.add(scan.id);
      totals.set(name, entry);
    }
  }
  const top = [...totals.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const maxCount = top[0]?.[1].count ?? 1;

  let ownedUnused = 0;
  let bundledUnused = 0;
  for (const scan of detected) {
    if (!scan.usageAvailable) continue;
    for (const skill of scan.skills) {
      const stat = scan.usage.get(skill.name.toLowerCase());
      if (stat && stat.count > 0) continue;
      if (skill.source === "plugin" || skill.source === "extension") bundledUnused++;
      else ownedUnused++;
    }
  }

  const when = /^(\d{4}-\d{2}-\d{2})/.exec(report.generatedAt)?.[1] ?? report.generatedAt;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>skill-slim · 技能账单</title>
<style>
  :root{
    --paper:#f6f1e7; --paper2:#efe7d6; --card:#fffdf8; --line:#e6dbc6;
    --ink:#3d3229; --ink-soft:#8a7a68;
    --walnut:#6d4f39; --walnut-deep:#54402f;
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
    color:#f6ecdd;padding:30px 32px;text-align:center;
    box-shadow:0 4px 18px rgba(84,64,47,.25);
  }
  .logo{font-family:Georgia,"Songti SC",serif;font-size:30px;letter-spacing:.5px}
  .logo b{color:#e8c894}
  .period{color:#e3d3bd;font-size:14px;margin-top:8px}
  main{max-width:760px;margin:0 auto;padding:28px 24px 48px}

  .bigs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
  .big{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:18px 20px;text-align:center;box-shadow:0 10px 26px rgba(74,55,40,.08);
  }
  .big .v{font-family:Georgia,serif;font-size:34px;line-height:1.1}
  .big .v.money{color:var(--amber)} .big .v.score{color:var(--sage)} .big .v.sleep{color:var(--terra)}
  .big .k{font-size:12px;color:var(--ink-soft);margin-top:6px}

  .panel{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:20px 24px;margin-bottom:16px;box-shadow:0 10px 26px rgba(74,55,40,.08);
  }
  .panel h2{font-family:Georgia,"Songti SC",serif;font-size:17px;margin-bottom:14px}
  .row{display:flex;align-items:center;gap:12px;margin:10px 0}
  .rank{font-family:Georgia,serif;font-size:16px;color:var(--oak,#a98362);width:22px;flex:none}
  .bar-wrap{flex:1;min-width:0}
  .bar-name{font-size:14px;font-weight:600;display:flex;justify-content:space-between;gap:10px}
  .bar-name .n{color:var(--ink-soft);font-weight:400;font-size:12px}
  .track{height:10px;border-radius:999px;background:var(--muted-bg);margin-top:6px;overflow:hidden}
  .fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--walnut),var(--oak,#a98362))}
  .note{color:var(--ink-soft);font-size:13px;line-height:1.8}
  .agent-chip{
    display:inline-flex;align-items:center;gap:8px;background:var(--muted-bg);
    border:1px solid var(--line);border-radius:999px;padding:6px 14px;margin:4px 4px 0 0;font-size:13px;
  }
  .agent-chip b{font-family:Georgia,serif;font-size:15px}
  footer{color:var(--ink-soft);font-size:12px;line-height:1.8;margin-top:22px;text-align:center}
</style></head>
<body>
<header>
  <div class="logo">skill-<b>slim</b> 技能账单</div>
  <div class="period">近 ${report.windowDays} 天 · ${when} · ${detected.length} 个 Agent</div>
</header>
<main>
  <div class="bigs">
    <div class="big"><div class="v">${totalConversations.toLocaleString()}</div><div class="k">次对话</div></div>
    <div class="big"><div class="v score">${report.score}<span style="font-size:18px"> ${grade(report.score)}</span></div><div class="k">综合健康分</div></div>
    <div class="big"><div class="v">~${report.totalAlwaysOnTokens.toLocaleString()}</div><div class="k">常驻 tokens / 每轮</div></div>
    <div class="big"><div class="v money">${esc(fmtUsd(report.totalMonthlyCost))}</div><div class="k">每月常驻成本（估）</div></div>
    <div class="big"><div class="v sleep">${ownedUnused + bundledUnused}</div><div class="k">从未调用的技能</div></div>
  </div>

  <div class="panel">
    <h2>🏆 最常调用的技能</h2>
    ${
      top.length === 0
        ? `<div class="note">这段时间没有可解析的调用记录——没有会话转录，或 Agent 不在本地记录技能调用。</div>`
        : top
            .map(
              ([name, t], i) => `
    <div class="row">
      <div class="rank">${i + 1}</div>
      <div class="bar-wrap">
        <div class="bar-name"><span>${esc(display.get(name) ?? name)}</span><span class="n">${t.count} 次 · ${[...t.agents].join(" / ")}</span></div>
        <div class="track"><div class="fill" style="width:${Math.max(6, Math.round((t.count / maxCount) * 100))}%"></div></div>
      </div>
    </div>`,
            )
            .join("")
    }
  </div>

  <div class="panel">
    <h2>😴 沉睡名单</h2>
    <div class="note">
      ${ownedUnused} 个你自己的技能在窗口内一次都没被调用（<code>skill-slim fix</code> 可安全隔离）；${bundledUnused} 个来自插件包（卸载插件即可）。
    </div>
  </div>

  <div class="panel">
    <h2>🩺 各 Agent 体检</h2>
    <div>
      ${detected
        .map(
          (s) =>
            `<span class="agent-chip"><b>${esc(agentScore(report, s.id))}</b> ${esc(s.name)} · ${s.skills.length} 技能${s.conversationCount > 0 ? ` · ${s.conversationCount} 次对话` : ""}</span>`,
        )
        .join("\n      ")}
    </div>
  </div>

  <footer>
    常驻上下文按每轮对话计费：~${report.totalAlwaysOnTokens.toLocaleString()} tokens ≈ ${esc(fmtUsd(report.totalBillPer1000))} / 千次对话。
    token 为启发式估算，成本按 $3/M input tokens。<br>
    由 skill-slim 在本地生成 · 数据不出本机。
  </footer>
</main>
</body></html>`;

  function agentScore(report: Report, id: string): string {
    const a = report.agents.find((x) => x.id === id);
    return a ? `${a.score}` : "–";
  }
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
