import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type { AgentScan } from "./types.ts";
import { exists, quarantineMove } from "./util/fsx.ts";
import { estimateTokens, PRICE_PER_MTOK } from "./util/tokens.ts";

export interface Move {
  agent: string;
  from: string;
  to: string;
  reason: string;
  /** Always-on description tokens recovered if this skill is quarantined. */
  recoverableTokens: number;
}

export interface QuarantineEntry {
  agent: string;
  name: string;
  originalPath: string;
  quarantinedPath: string;
  movedAt: string;
}

function manifestPath(home: string): string {
  return path.join(home, ".skill-slim", "quarantine", "manifest.json");
}

/**
 * Fix plan v1: quarantine never-invoked skills the user owns (global/project
 * source only). Plugin-bundled skills live in caches managed by the agent
 * itself — moving them breaks plugin integrity; uninstall the plugin instead.
 * Nothing is deleted; `restore` moves skills back via the manifest.
 */
export function planFix(scans: AgentScan[]): Move[] {
  const moves: Move[] = [];
  for (const scan of scans) {
    if (!scan.detected || !scan.usageAvailable) continue;
    for (const skill of scan.skills) {
      if (skill.source !== "global" && skill.source !== "project") continue;
      const stat = scan.usage.get(skill.name.toLowerCase());
      if (stat && stat.count > 0) continue;
      moves.push({
        agent: scan.id,
        from: skill.path,
        to: path.join(scan.id, path.basename(skill.path)),
        reason: `never invoked in scan window (${skill.source})`,
        recoverableTokens: estimateTokens(skill.description),
      });
    }
  }
  return moves;
}

export function totalSavings(moves: Move[]): number {
  return moves.reduce((sum, m) => sum + m.recoverableTokens, 0);
}

/**
 * Monthly USD savings of applying the plan, extrapolated from each agent's
 * observed conversation count inside the scan window.
 */
export function estimateMonthlySavings(
  moves: Move[],
  conversationsByAgent: Map<string, number>,
  windowDays: number,
): number {
  const tokensByAgent = new Map<string, number>();
  for (const move of moves) {
    tokensByAgent.set(move.agent, (tokensByAgent.get(move.agent) ?? 0) + move.recoverableTokens);
  }
  let monthly = 0;
  for (const [agent, tokens] of tokensByAgent) {
    const conversations = conversationsByAgent.get(agent) ?? 0;
    monthly += (tokens / 1_000_000) * PRICE_PER_MTOK * conversations * (30 / windowDays);
  }
  return monthly;
}

export async function applyFix(
  moves: Move[],
  home: string,
): Promise<{ moved: Move[]; failed: { move: Move; error: string }[] }> {
  const quarantineRoot = path.join(home, ".skill-slim", "quarantine");
  await fsp.mkdir(quarantineRoot, { recursive: true });
  const manifest = await readManifest(home);

  const moved: Move[] = [];
  const failed: { move: Move; error: string }[] = [];
  for (const move of moves) {
    const dest = path.join(quarantineRoot, move.to);
    try {
      await quarantineMove(move.from, dest);
      moved.push({ ...move, to: dest });
      manifest.push({
        agent: move.agent,
        name: path.basename(move.from),
        originalPath: move.from,
        quarantinedPath: dest,
        movedAt: new Date().toISOString(),
      });
    } catch (err) {
      failed.push({ move, error: String(err) });
    }
  }
  if (moved.length > 0) {
    await fsp.writeFile(manifestPath(home), JSON.stringify(manifest, null, 2), "utf8");
  }
  return { moved, failed };
}

export async function readManifest(home: string): Promise<QuarantineEntry[]> {
  try {
    const raw = await fsp.readFile(manifestPath(home), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeManifest(home: string, entries: QuarantineEntry[]): Promise<void> {
  await fsp.mkdir(path.dirname(manifestPath(home)), { recursive: true });
  await fsp.writeFile(manifestPath(home), JSON.stringify(entries, null, 2), "utf8");
}

/**
 * Move quarantined skills back to their original locations. With `name`
 * (matched against the recorded skill name) restores just that entry;
 * without it, restores everything. Entries whose original path is now
 * occupied are skipped, never overwritten.
 */
export async function restore(
  home: string,
  name?: string,
  agent?: string,
): Promise<{ restored: QuarantineEntry[]; skipped: { entry: QuarantineEntry; reason: string }[] }> {
  const manifest = await readManifest(home);
  const match = name ? name.toLowerCase() : null;
  const targets = manifest.filter(
    (e) => (!match || e.name.toLowerCase() === match) && (!agent || e.agent === agent),
  );
  const restored: QuarantineEntry[] = [];
  const skipped: { entry: QuarantineEntry; reason: string }[] = [];
  const remaining = [...manifest];

  for (const entry of targets) {
    if (!(await exists(entry.quarantinedPath))) {
      skipped.push({ entry, reason: "quarantined copy is gone" });
      remaining.splice(remaining.indexOf(entry), 1);
      continue;
    }
    if (await exists(entry.originalPath)) {
      skipped.push({ entry, reason: "original path is occupied" });
      continue;
    }
    try {
      await quarantineMove(entry.quarantinedPath, entry.originalPath);
      restored.push(entry);
      remaining.splice(remaining.indexOf(entry), 1);
    } catch {
      skipped.push({ entry, reason: "move failed" });
    }
  }
  await writeManifest(home, remaining);
  return { restored, skipped };
}
