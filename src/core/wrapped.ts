import type { AgentScan, Report } from "../types.ts";
import { grade, hasUsageEvidence, usageCount } from "./checks.ts";
import { fmtUsd } from "../util/tokens.ts";
import { fmt, type Lang } from "../i18n.ts";

/**
 * `skill-slim wrapped` — a Spotify-Wrapped-style shareable bill for your
 * agent skills: most-invoked leaderboard, never-invoked count, always-on
 * cost and per-agent score cards, in the same wood & paper brand as the
 * health report. Zero JS, self-contained, print-friendly.
 */

/**
 * Never-invoked skills, counted with exactly the rules the health check uses
 * (name + folder-name lookup, conversation-count evidence gate), so the bill,
 * the terminal teaser and the report never disagree.
 */
export function countUnused(scans: AgentScan[]): { owned: number; bundled: number } {
  let owned = 0;
  let bundled = 0;
  for (const scan of scans) {
    if (!scan.detected || !hasUsageEvidence(scan)) continue;
    for (const skill of scan.skills) {
      if (usageCount(scan, skill) > 0) continue;
      if (skill.source === "plugin" || skill.source === "extension") bundled++;
      else owned++;
    }
  }
  return { owned, bundled };
}

/**
 * Aggregate skill invocations across detected agents, resolving both
 * frontmatter names and folder names (e.g. `workflow_skill_creator` →
 * `workflow-skill-creator`) to a single canonical entry.
 */
export function aggregateUsage(scans: AgentScan[]): { name: string; count: number; agents: Set<string> }[] {
  const canonical = new Map<string, { key: string; display: string }>();
  for (const scan of scans) {
    if (!scan.detected) continue;
    for (const skill of scan.skills) {
      const key = skill.name.toLowerCase();
      canonical.set(key, { key, display: skill.name });
    }
  }
  for (const scan of scans) {
    if (!scan.detected) continue;
    for (const skill of scan.skills) {
      if (!skill.dirName) continue;
      const dirKey = skill.dirName.toLowerCase().replace(/\.(md|mdc|toml)$/, "");
      if (!canonical.has(dirKey)) {
        canonical.set(dirKey, { key: skill.name.toLowerCase(), display: skill.name });
      }
    }
  }
  const totals = new Map<string, { name: string; count: number; agents: Set<string> }>();
  for (const scan of scans) {
    if (!scan.detected) continue;
    for (const [raw, stat] of scan.usage) {
      if (stat.count <= 0) continue;
      const resolved = canonical.get(raw);
      const key = resolved?.key ?? raw;
      const display = resolved?.display ?? raw;
      const entry = totals.get(key) ?? { name: display, count: 0, agents: new Set<string>() };
      entry.count += stat.count;
      entry.agents.add(scan.id);
      totals.set(key, entry);
    }
  }
  return [...totals.values()].sort((a, b) => b.count - a.count);
}

const WRAPPED_COPY = {
  en: {
    htmlLang: "en",
    title: "skill-slim · skills bill",
    logoSuffix: "skills bill",
    period: "Last {0} days · {1} · {2} agents",
    conversations: "conversations",
    health: "overall health",
    alwaysOn: "always-on tokens / conversation",
    monthly: "always-on cost / month (est.)",
    neverInvoked: "never-invoked skills",
    topTitle: "Most-invoked skills",
    noUsage: "No parseable invocations in this window — either there are no session transcripts, or the agent doesn't record skill calls locally.",
    times: "{0}×",
    sleepTitle: "Sleepers",
    sleepers: "{0} of your own skills were never invoked in this window (<code>skill-slim fix</code> quarantines them safely); {1} come from plugin bundles (uninstall the plugin instead).",
    sleepNoEvidence: "Not enough conversations in this window to call any skill unused yet — check back after a few more sessions.",
    agentsTitle: "Per-agent health",
    skills: "{0} skills", skillsOne: "{0} skill",
    conv: "{0} conversations", convOne: "{0} conversation",
    footer1: "Always-on context is paid on every conversation: ~{0} tokens ≈ {1} per 1k conversations. Token counts are a heuristic, priced at $3 per 1M input tokens.",
    footer2: "Generated locally by skill-slim · no data leaves this machine.",
  },
  zh: {
    htmlLang: "zh-CN",
    title: "skill-slim · 技能账单",
    logoSuffix: "技能账单",
    period: "近 {0} 天 · {1} · {2} 个 Agent",
    conversations: "次对话",
    health: "综合健康分",
    alwaysOn: "常驻 tokens / 每轮",
    monthly: "每月常驻成本（估）",
    neverInvoked: "从未调用的技能",
    topTitle: "最常调用的技能",
    noUsage: "这段时间没有可解析的调用记录——没有会话转录，或 Agent 不在本地记录技能调用。",
    times: "{0} 次",
    sleepTitle: "沉睡名单",
    sleepers: "{0} 个你自己的技能在窗口内一次都没被调用（<code>skill-slim fix</code> 可安全隔离）；{1} 个来自插件包（卸载插件即可）。",
    sleepNoEvidence: "窗口内会话太少，还不能判断哪些技能没用过——多用几次再来看。",
    agentsTitle: "各 Agent 体检",
    skills: "{0} 个技能", skillsOne: "{0} 个技能",
    conv: "{0} 次对话", convOne: "{0} 次对话",
    footer1: "常驻上下文按每轮对话计费：~{0} tokens ≈ {1} / 千次对话。token 为启发式估算，成本按 $3/M input tokens。",
    footer2: "由 skill-slim 在本地生成 · 数据不出本机。",
  },
} satisfies Record<Lang, Record<string, string>>;

export function renderWrappedHtml(report: Report, scans: AgentScan[], lang: Lang = "en"): string {
  const detected = scans.filter((s) => s.detected);
  const totalConversations = detected.reduce((sum, s) => sum + s.conversationCount, 0);

  const top = aggregateUsage(detected).slice(0, 5);
  const maxCount = top[0]?.count ?? 1;

  const { owned: ownedUnused, bundled: bundledUnused } = countUnused(detected);

  const when = /^(\d{4}-\d{2}-\d{2})/.exec(report.generatedAt)?.[1] ?? report.generatedAt;
  const T = WRAPPED_COPY[lang];
  const t = (key: keyof typeof T, ...args: (string | number)[]) => fmt(T[key], ...args);
  const num = (n: number) => n.toLocaleString("en-US");
  const evidence = detected.some((s) => hasUsageEvidence(s));

  return `<!doctype html>
<html lang="${T.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(T.title)}</title>
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
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
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

  .bigs{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:12px;margin-bottom:22px}
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
  <div class="logo">skill-<b>slim</b> ${esc(T.logoSuffix)}</div>
  <div class="period">${esc(t("period", report.windowDays, when, detected.length))}</div>
</header>
<main>
  <div class="bigs">
    <div class="big"><div class="v">${num(totalConversations)}</div><div class="k">${T.conversations}</div></div>
    <div class="big"><div class="v score">${report.score}<span style="font-size:18px"> ${grade(report.score)}</span></div><div class="k">${T.health}</div></div>
    <div class="big"><div class="v">~${num(report.totalAlwaysOnTokens)}</div><div class="k">${T.alwaysOn}</div></div>
    <div class="big"><div class="v money">${esc(fmtUsd(report.totalMonthlyCost))}</div><div class="k">${T.monthly}</div></div>
    <div class="big"><div class="v sleep">${evidence ? ownedUnused + bundledUnused : "–"}</div><div class="k">${T.neverInvoked}</div></div>
  </div>

  <div class="panel">
    <h2>🏆 ${T.topTitle}</h2>
    ${
      top.length === 0
        ? `<div class="note">${T.noUsage}</div>`
        : top
            .map(
              (u, i) => `
    <div class="row">
      <div class="rank">${i + 1}</div>
      <div class="bar-wrap">
        <div class="bar-name"><span>${esc(u.name)}</span><span class="n">${esc(fmt(T.times, u.count))} · ${[...u.agents].join(" / ")}</span></div>
        <div class="track"><div class="fill" style="width:${Math.max(6, Math.round((u.count / maxCount) * 100))}%"></div></div>
      </div>
    </div>`,
            )
            .join("")
    }
  </div>

  <div class="panel">
    <h2>😴 ${T.sleepTitle}</h2>
    <div class="note">
      ${evidence ? t("sleepers", ownedUnused, bundledUnused) : T.sleepNoEvidence}
    </div>
  </div>

  <div class="panel">
    <h2>🩺 ${T.agentsTitle}</h2>
    <div>
      ${detected
        .map(
          (s) =>
            `<span class="agent-chip"><b>${esc(agentScore(report, s.id))}</b> ${esc(s.name)} · ${esc(fmt(s.skills.length === 1 ? T.skillsOne : T.skills, s.skills.length))}${s.conversationCount > 0 ? ` · ${esc(fmt(s.conversationCount === 1 ? T.convOne : T.conv, s.conversationCount))}` : ""}</span>`,
        )
        .join("\n      ")}
    </div>
  </div>

  <footer>
    ${esc(t("footer1", num(report.totalAlwaysOnTokens), fmtUsd(report.totalBillPer1000)))}<br>
    ${T.footer2}
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
