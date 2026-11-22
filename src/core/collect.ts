import * as os from "node:os";
import { resolveAdapters, scanAgent } from "../adapters/index.ts";
import type { Adapter, AgentReport, AgentScan, Report } from "../types.ts";
import { runChecks } from "./checks.ts";

/**
 * Shared scan entry for the CLI and the local UI server. The home directory
 * can be overridden for tests via SKILL_SLIM_HOME.
 */
export function getHome(): string {
  return process.env.SKILL_SLIM_HOME || os.homedir();
}

export interface Collected {
  report: Report;
  scans: AgentScan[];
  adapters: Adapter[];
  windowDays: number;
}

export async function collect(windowDays = 30, selected?: string[]): Promise<Collected> {
  const adapters = resolveAdapters(selected);
  const ctx = { home: getHome(), cwd: process.cwd(), windowDays };
  const scans: AgentScan[] = [];
  for (const adapter of adapters) {
    scans.push(await scanAgent(adapter, ctx));
  }
  const reports = scans.map((s) => runChecks(s, windowDays));
  return { report: aggregate(reports, windowDays), scans, adapters, windowDays };
}

/**
 * Tokens the user can actually win back for one agent: actionable findings
 * only (plugin-bundle noise is the plugin's to fix), and each skill counted
 * once even when it is both unused and a duplicate.
 */
export function recoverableTokens(r: AgentReport): number {
  const actionable = r.findings.filter((f) => f.severity !== "info" && (f.recoverableTokens ?? 0) > 0);
  const counted = new Set<string>();
  let total = 0;
  for (const f of actionable.filter((f) => f.kind === "unused")) {
    if (counted.has(f.paths[0])) continue;
    counted.add(f.paths[0]);
    total += f.recoverableTokens ?? 0;
  }
  for (const f of actionable.filter((f) => f.kind !== "unused")) {
    if (f.paths.some((p) => counted.has(p))) continue;
    f.paths.forEach((p) => counted.add(p));
    total += f.recoverableTokens ?? 0;
  }
  return total;
}

export function aggregate(reports: AgentReport[], windowDays: number): Report {
  const detected = reports.filter((r) => r.detected);
  const totalAlwaysOnTokens = detected.reduce((s, r) => s + r.alwaysOnTokens, 0);
  const totalBillPer1000 = detected.reduce((s, r) => s + r.billPer1000, 0);
  const totalMonthlyCost = detected.reduce((s, r) => s + r.monthlyCost, 0);
  const totalRecoverable = detected.reduce((s, r) => s + recoverableTokens(r), 0);
  // Agents that carry nothing (no skills, no instruction files) have nothing
  // to grade; averaging their default 100 in would inflate the headline score.
  // The rest are weighted by how much they carry, so a 40-skill agent counts
  // more than a 1-skill one.
  const graded = detected.filter((r) => r.skillCount + r.instructionCount > 0);
  const weight = (r: AgentReport): number => r.skillCount + r.instructionCount;
  const totalWeight = graded.reduce((s, r) => s + weight(r), 0);
  const score = totalWeight
    ? Math.round(graded.reduce((s, r) => s + r.score * weight(r), 0) / totalWeight)
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
