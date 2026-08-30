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

export function aggregate(reports: AgentReport[], windowDays: number): Report {
  const detected = reports.filter((r) => r.detected);
  const totalAlwaysOnTokens = detected.reduce((s, r) => s + r.alwaysOnTokens, 0);
  const totalBillPer1000 = detected.reduce((s, r) => s + r.billPer1000, 0);
  const totalMonthlyCost = detected.reduce((s, r) => s + r.monthlyCost, 0);
  const totalRecoverable = detected.reduce(
    (s, r) => s + r.findings.reduce((fs2, f) => s + (f.recoverableTokens ?? 0), 0),
    0,
  );
  const score = detected.length ? Math.round(detected.reduce((s, r) => s + r.score, 0) / detected.length) : 100;
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
