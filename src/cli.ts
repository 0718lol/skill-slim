#!/usr/bin/env node
import * as path from "node:path";
import { ADAPTERS } from "./adapters/index.ts";
import { evaluateGates, grade, runChecks } from "./core/checks.ts";
import { collect, getHome } from "./core/collect.ts";
import { renderHtml, renderTerminal, toJson, writeReportFile } from "./core/report.ts";
import { renderWrappedHtml } from "./core/wrapped.ts";
import { applyFix, estimateMonthlySavings, planFix, readManifest, restore, totalSavings } from "./fix.ts";
import { startServer } from "./server.ts";
import { fmtUsd } from "./util/tokens.ts";

const VERSION = "0.2.0";

interface CliOptions {
  command: string;
  name?: string;
  agents?: string[];
  days: number;
  json: boolean;
  html?: string;
  apply: boolean;
  verbose: boolean;
  minScore?: number;
  maxAlwaysOnTokens?: number;
  port?: number;
  noOpen: boolean;
  help: boolean;
}

export async function main(argv: string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exitCode = 2;
    return 2;
  }

  if (opts.help) {
    printHelp();
    return 0;
  }

  if (opts.command === "agents") {
    return runAgentsList();
  }

  if (opts.command === "serve") {
    return runServe(opts);
  }

  if (opts.command === "restore") {
    return runRestore(opts);
  }

  let collected;
  try {
    collected = await collect(opts.days, opts.agents);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  if (opts.command === "fix") {
    return runFix(opts, collected);
  }

  if (opts.command === "wrapped") {
    return runWrapped(opts, collected);
  }

  const { report } = collected;
  if (opts.json) {
    console.log(toJson(report));
  } else {
    console.log(renderTerminal(report, { verbose: opts.verbose }));
  }
  if (opts.html) {
    writeReportFile(opts.html, renderHtml(report));
    if (!opts.json) console.log(`HTML report written to ${opts.html}`);
  }
  const failures = evaluateGates(report, { minScore: opts.minScore, maxAlwaysOnTokens: opts.maxAlwaysOnTokens });
  if (failures.length > 0) {
    if (!opts.json) {
      for (const f of failures) console.error(f);
    }
    return 1;
  }
  return 0;
}

async function runWrapped(
  opts: CliOptions,
  collected: Awaited<ReturnType<typeof collect>>,
): Promise<number> {
  const { report, scans } = collected;
  const file = opts.html ?? "skill-slim-wrapped.html";
  writeReportFile(file, renderWrappedHtml(report, scans));

  // terminal teaser: top skill + sleepers + score, the rest lives in the file
  const detected = scans.filter((s) => s.detected);
  const totals = new Map<string, number>();
  for (const scan of detected) {
    for (const [name, stat] of scan.usage) {
      if (stat.count > 0) totals.set(name, (totals.get(name) ?? 0) + stat.count);
    }
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  let sleepers = 0;
  for (const scan of detected) {
    if (!scan.usageAvailable) continue;
    for (const skill of scan.skills) {
      const stat = scan.usage.get(skill.name.toLowerCase());
      if (!stat || stat.count === 0) sleepers++;
    }
  }

  console.log(`\n  skill-slim wrapped · 近 ${opts.days} 天`);
  console.log(`  ${top ? `最常用: ${top[0]} (${top[1]} 次)` : "无可解析的调用记录"} · 从未调用: ${sleepers} 个 · 健康分 ${report.score} (${grade(report.score)})`);
  console.log(`  ✓ 技能账单已写入 ${file} — 打开它，分享你的账单\n`);
  return 0;
}

async function runServe(opts: CliOptions): Promise<number> {
  try {
    const handle = await startServer({ port: opts.port, open: !opts.noOpen, windowDays: opts.days });
    console.log(`  Ctrl+C 退出。`);
    await handle.wait();
    return 0;
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }
}

async function runAgentsList(): Promise<number> {
  const home = getHome();
  console.log("\n  supported agents:\n");
  for (const adapter of ADAPTERS) {
    const ok = await adapter.detect({ home });
    console.log(`  ${ok ? "●" : "○"} ${adapter.name.padEnd(14)} [${adapter.id}] ${ok ? "detected" : "not found"} (${adapter.hint})`);
  }
  console.log("");
  return 0;
}

async function runRestore(opts: CliOptions): Promise<number> {
  const home = getHome();
  if (!opts.name) {
    const manifest = await readManifest(home);
    if (manifest.length === 0) {
      console.log("\n  quarantine is empty — nothing to restore.\n");
      return 0;
    }
    console.log(`\n  ${manifest.length} quarantined skill(s):\n`);
    for (const entry of manifest) {
      console.log(`  ▲ [${entry.agent}] ${entry.name}  (${entry.movedAt})`);
      console.log(`    restore with: skill-slim restore ${entry.name}`);
    }
    console.log("");
    return 0;
  }
  const { restored, skipped } = await restore(home, opts.name, opts.agents?.[0]);
  for (const entry of restored) {
    console.log(`  ✓ restored ${entry.name} → ${entry.originalPath}`);
  }
  for (const s of skipped) {
    console.log(`  ○ skipped ${s.entry.name}: ${s.reason}`);
  }
  if (restored.length === 0 && skipped.length === 0) {
    console.error(`  no quarantined entry matches "${opts.name}"`);
    return 1;
  }
  console.log(`\n  restart your agent session to take effect.\n`);
  return 0;
}

function averageScore(reports: { detected: boolean; score: number }[]): number {
  const detected = reports.filter((r) => r.detected);
  return detected.length ? Math.round(detected.reduce((s, r) => s + r.score, 0) / detected.length) : 100;
}

async function runFix(
  opts: CliOptions,
  collected: Awaited<ReturnType<typeof collect>>,
): Promise<number> {
  const { scans } = collected;
  const before = scans.map((s) => runChecks(s, opts.days));
  const moves = planFix(scans);
  if (moves.length === 0) {
    console.log("\n  nothing to fix — no safely-quarantineable unused skills found.\n");
    return 0;
  }

  const conversations = new Map(scans.map((s) => [s.id, s.conversationCount]));
  const savingsTokens = totalSavings(moves);
  const monthly = estimateMonthlySavings(moves, conversations, opts.days);

  console.log(`\n  fix plan — ${moves.length} skill(s) to quarantine:\n`);
  for (const move of moves) {
    console.log(`  ▲ [${move.agent}] ${move.from}`);
    console.log(`    → ${move.to}  (${move.reason})`);
  }
  console.log(
    `\n  upside: ~${savingsTokens.toLocaleString()} fewer always-on tokens per conversation` +
      (monthly > 0 ? ` ≈ ${fmtUsd(monthly)}/month at your pace` : ``),
  );

  if (!opts.apply) {
    console.log(`\n  dry-run only. Re-run with --apply to move these directories to`);
    console.log(`  ~/.skill-slim/quarantine/ (nothing is deleted; 'skill-slim restore' brings them back).\n`);
    return 0;
  }

  const { moved, failed } = await applyFix(moves, getHome());
  for (const m of moved) {
    console.log(`  ✓ moved ${m.from} → ${m.to}`);
  }
  for (const f of failed) {
    console.error(`  ✖ failed ${f.move.from}: ${f.error}`);
  }

  if (moved.length > 0) {
    // re-scan so the user sees the payoff, not just the action
    const after = await collect(opts.days, opts.agents);
    const afterReports = after.scans.map((s) => runChecks(s, opts.days));
    const beforeScore = averageScore(before);
    const afterScore = averageScore(afterReports);
    console.log(
      `\n  health score: ${beforeScore}/100 (${grade(beforeScore)}) → ` +
        `${afterScore}/100 (${grade(afterScore)})`,
    );
    for (const m of moved) {
      const b = before.find((r) => r.id === m.agent);
      const a = afterReports.find((r) => r.id === m.agent);
      if (b && a && b.score !== a.score) {
        console.log(`  · [${m.agent}] ${b.score} → ${a.score}`);
      }
    }
  }
  console.log(`\n  ${moved.length} quarantined, ${failed.length} failed. Restart your agent session to take effect.\n`);
  return failed.length > 0 ? 1 : 0;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    command: "check",
    days: 30,
    json: false,
    apply: false,
    verbose: false,
    noOpen: false,
    help: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--days") {
      opts.days = Number(argv[++i]);
      if (!Number.isFinite(opts.days) || opts.days <= 0) throw new Error("--days expects a positive number");
    } else if (arg === "--agent") {
      opts.agents = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--html") {
      opts.html = argv[++i] ?? "skill-slim-report.html";
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--verbose") {
      opts.verbose = true;
    } else if (arg === "--port") {
      opts.port = Number(argv[++i]);
      if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
        throw new Error("--port expects a valid port number");
      }
    } else if (arg === "--no-open") {
      opts.noOpen = true;
    } else if (arg === "--min-score") {
      opts.minScore = Number(argv[++i]);
      if (!Number.isFinite(opts.minScore) || opts.minScore < 0 || opts.minScore > 100) {
        throw new Error("--min-score expects a number between 0 and 100");
      }
    } else if (arg === "--max-always-on-tokens") {
      opts.maxAlwaysOnTokens = Number(argv[++i]);
      if (!Number.isFinite(opts.maxAlwaysOnTokens) || opts.maxAlwaysOnTokens < 0) {
        throw new Error("--max-always-on-tokens expects a non-negative number");
      }
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--version") {
      console.log(`skill-slim v${VERSION}`);
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag "${arg}" (see --help)`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 0) {
    const cmd = positional[0];
    if (cmd !== "check" && cmd !== "fix" && cmd !== "agents" && cmd !== "restore" && cmd !== "serve" && cmd !== "wrapped") {
      throw new Error(`unknown command "${cmd}" (see --help)`);
    }
    opts.command = cmd;
    opts.name = positional[1];
  }
  return opts;
}

function printHelp(): void {
  console.log(`
  skill-slim v${VERSION} — health check for your AI coding agent's skills & context

  usage: skill-slim [command] [options]

  commands:
    check     scan installed agents and print a health report (default)
    serve     open the local web dashboard in your browser
    fix       quarantine never-invoked skills (dry-run unless --apply)
    restore   list quarantined skills, or move one back: restore <name>
    wrapped   write a shareable skills bill (leaderboard + sleepers)
    agents    list supported agents and whether they were detected

  options:
    --agent <a,b>   only scan these agents (claude-code, codex, gemini-cli, cursor,
                    opencode, windsurf, zed, copilot-cli)
    --days <n>      usage window in days (default 30)
    --json          machine-readable JSON output
    --html <file>   also write a shareable HTML report
    --apply         with fix: actually move directories
    --verbose       show informational findings hidden by default
    --min-score <n> exit with code 1 when the overall score is below n (CI)
    --max-always-on-tokens <n>
                    exit with code 1 when always-on context exceeds n tokens (CI)
    --port <n>      with serve: port for the dashboard (default 7466)
    --no-open       with serve: don't open the browser automatically
    --help, -h      show this help

  examples:
    skill-slim
    skill-slim serve
    skill-slim check --agent claude-code --days 14
    skill-slim fix --apply
    skill-slim restore verify-engineering-work
    skill-slim --min-score 80 --max-always-on-tokens 3000 && npm test   # in CI
`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
}
