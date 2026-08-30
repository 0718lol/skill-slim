#!/usr/bin/env node
import * as os from "node:os";
import * as path from "node:path";
import { ADAPTERS, resolveAdapters, scanAgent } from "./adapters/index.ts";
import { runChecks } from "./core/checks.ts";
import { renderHtml, renderTerminal, toJson, writeReportFile } from "./core/report.ts";
import { applyFix, planFix, readManifest, restore } from "./fix.ts";
import type { Report } from "./types.ts";

const VERSION = "0.1.0";

interface CliOptions {
  command: string;
  name?: string;
  agents?: string[];
  days: number;
  json: boolean;
  html?: string;
  apply: boolean;
  minScore?: number;
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

  if (opts.command === "restore") {
    return runRestore(opts);
  }

  const ctx = { home: os.homedir(), cwd: process.cwd(), windowDays: opts.days };
  let adapters;
  try {
    adapters = resolveAdapters(opts.agents);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  const scans = [];
  for (const adapter of adapters) {
    scans.push(await scanAgent(adapter, ctx));
  }

  if (opts.command === "fix") {
    return runFix(scans, opts);
  }

  const reports = scans.map((s) => runChecks(s, opts.days));
  const report = aggregateReport(reports, opts.days);

  if (opts.json) {
    console.log(toJson(report));
  } else {
    console.log(renderTerminal(report));
  }
  if (opts.html) {
    writeReportFile(opts.html, renderHtml(report));
    if (!opts.json) console.log(`HTML report written to ${opts.html}`);
  }
  if (opts.minScore !== undefined && report.score < opts.minScore) {
    if (!opts.json) {
      console.error(`health score ${report.score} is below --min-score ${opts.minScore}`);
    }
    return 1;
  }
  return 0;
}

function aggregateReport(reports: ReturnType<typeof runChecks>[], windowDays: number): Report {
  const detected = reports.filter((r) => r.detected);
  const totalAlwaysOnTokens = detected.reduce((s, r) => s + r.alwaysOnTokens, 0);
  const totalBillPer1000 = detected.reduce((s, r) => s + r.billPer1000, 0);
  const totalMonthlyCost = detected.reduce((s, r) => s + r.monthlyCost, 0);
  const totalRecoverable = detected.reduce(
    (s, r) => s + r.findings.reduce((fs2, f) => s + (f.recoverableTokens ?? 0), 0),
    0,
  );
  const score = detected.length
    ? Math.round(detected.reduce((s, r) => s + r.score, 0) / detected.length)
    : 100;
  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    agents: reports,
    totalAlwaysOnTokens,
    totalBillPer1000,
    totalMonthlyCost,
    totalRecoverableTokens: totalRecoverable,
    score,
  };
}

async function runRestore(opts: CliOptions): Promise<number> {
  const home = os.homedir();
  if (!opts.name) {
    const manifest = await readManifest(home);
    if (manifest.length === 0) {
      console.log("\n  quarantine is empty — nothing to restore.\n");
      return 0;
    }
    console.log(`\n  ${manifest.length} quarantined skill(s):\n`);
    for (const entry of manifest) {
      console.log(`  ▲ [${entry.agent}] ${entry.name}  (${entry.movedAt})`);
      console.log(`    restore with: skill-doctor restore ${entry.name}`);
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

async function runAgentsList(): Promise<number> {
  const home = os.homedir();
  console.log("\n  supported agents:\n");
  for (const adapter of ADAPTERS) {
    const ok = await adapter.detect({ home });
    console.log(`  ${ok ? "●" : "○"} ${adapter.name.padEnd(14)} [${adapter.id}] ${ok ? "detected" : "not found"} (${adapter.hint})`);
  }
  console.log("");
  return 0;
}

async function runFix(scans: Awaited<ReturnType<typeof scanAgent>>[], opts: CliOptions): Promise<number> {
  const moves = planFix(scans);
  if (moves.length === 0) {
    console.log("\n  nothing to fix — no safely-quarantineable unused skills found.\n");
    return 0;
  }
  console.log(`\n  fix plan — ${moves.length} skill(s) to quarantine:\n`);
  for (const move of moves) {
    console.log(`  ▲ [${move.agent}] ${move.from}`);
    console.log(`    → ${move.to}  (${move.reason})`);
  }
  if (!opts.apply) {
    console.log(`\n  dry-run only. Re-run with --apply to move these directories to`);
    console.log(`  ~/.skill-doctor/quarantine/ (nothing is deleted; move them back to restore).\n`);
    return 0;
  }
  const { moved, failed } = await applyFix(moves, os.homedir());
  for (const m of moved) {
    console.log(`  ✓ moved ${m.from} → ${m.to}`);
  }
  for (const f of failed) {
    console.error(`  ✖ failed ${f.move.from}: ${f.error}`);
  }
  console.log(`\n  ${moved.length} quarantined, ${failed.length} failed. Restart your agent session to take effect.\n`);
  return failed.length > 0 ? 1 : 0;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { command: "check", days: 30, json: false, apply: false, help: false };
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
      opts.html = argv[++i] ?? "skill-doctor-report.html";
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--min-score") {
      opts.minScore = Number(argv[++i]);
      if (!Number.isFinite(opts.minScore) || opts.minScore < 0 || opts.minScore > 100) {
        throw new Error("--min-score expects a number between 0 and 100");
      }
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--version") {
      console.log(`skill-doctor v${VERSION}`);
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag "${arg}" (see --help)`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 0) {
    const cmd = positional[0];
    if (cmd !== "check" && cmd !== "fix" && cmd !== "agents" && cmd !== "restore") {
      throw new Error(`unknown command "${cmd}" (see --help)`);
    }
    opts.command = cmd;
    opts.name = positional[1];
  }
  return opts;
}

function printHelp(): void {
  console.log(`
  skill-doctor v${VERSION} — health check for your AI coding agent's skills & context

  usage: skill-doctor [command] [options]

  commands:
    check     scan installed agents and print a health report (default)
    fix       quarantine never-invoked skills (dry-run unless --apply)
    restore   list quarantined skills, or move one back: restore <name>
    agents    list supported agents and whether they were detected

  options:
    --agent <a,b>   only scan these agents (claude-code, codex, gemini-cli, cursor)
    --days <n>      usage window in days (default 30)
    --json          machine-readable JSON output
    --html <file>   also write a shareable HTML report
    --apply         with fix: actually move directories
    --min-score <n> exit with code 1 when the overall score is below n (CI)
    --help, -h      show this help

  examples:
    skill-doctor
    skill-doctor check --agent claude-code --days 14
    skill-doctor fix --apply
    skill-doctor restore verify-engineering-work
    skill-doctor --min-score 80 && npm test   # in CI
`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
}
