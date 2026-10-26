import * as path from "node:path";
import * as zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import type { AgentId, AgentScan, UsageStat } from "../types.ts";
import { exists } from "../util/fsx.ts";
import { SKILL_PATH_RE } from "../util/sqlite-scan.ts";
import { loadContextFiles, loadSkillDirs } from "./skill-loader.ts";

/**
 * Zed (v1.4+) reads skills from the cross-agent standard roots
 * ~/.agents/skills/ and <project>/.agents/skills/ (flat layout, SKILL.md per
 * folder) and always-on instructions from ~/.config/zed/AGENTS.md plus project
 * AGENTS.md. Usage evidence lives in the agent threads database
 * (threads/threads.db under Zed's app-data dir): one row per thread whose
 * `data` column is the thread JSON — zstd-compressed on current Zed
 * (`data_type = "zstd"`), plain JSON on legacy rows. Counts are evidence-gated
 * on the skill system actually appearing.
 */
export const zedAdapter = {
  id: "zed" as AgentId,
  name: "Zed",
  hint: "~/.config/zed",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".config", "zed"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const notes: string[] = [];
    const detected = (await this.detect({ home: ctx.home })) || (await exists(path.join(ctx.cwd, ".agents", "skills")));
    if (!detected) {
      return {
        id: this.id,
        name: this.name,
        detected: false,
        skills: [],
        instructions: [],
        usage: new Map(),
        usageAvailable: false,
        conversationCount: 0,
        notes,
      };
    }

    const skills = await loadSkillDirs(this.id, [
      { dir: path.join(ctx.home, ".agents", "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".agents", "skills"), source: "project" },
    ]);
    if (skills.length > 0) {
      notes.push("skills live in ~/.agents/skills — the cross-agent standard, shared with other readers");
    }

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(ctx.home, ".config", "zed", "AGENTS.md"), label: "global AGENTS.md" },
      { file: path.join(ctx.cwd, "AGENTS.md"), label: "project AGENTS.md" },
    ]);

    const { usage, usageAvailable, conversationCount, notes: usageNotes } = await parseUsage(ctx.home, ctx.windowDays);
    notes.push(...usageNotes);

    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage,
      usageAvailable,
      conversationCount,
      notes,
    };
  },
};

function threadsDbPath(home: string): string {
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Zed", "threads", "threads.db");
  }
  if (process.platform === "win32") {
    return path.join(home, "AppData", "Local", "Zed", "threads", "threads.db");
  }
  return path.join(home, ".local", "share", "zed", "threads", "threads.db");
}

async function parseUsage(
  home: string,
  windowDays: number,
): Promise<{ usage: Map<string, UsageStat>; usageAvailable: boolean; conversationCount: number; notes: string[] }> {
  const notes: string[] = [];
  const dbFile = threadsDbPath(home);
  if (!(await exists(dbFile))) {
    notes.push("no Zed threads database found");
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }

  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const usage = new Map<string, UsageStat>();
  let conversations = 0;
  let sawSkillSystem = false;

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });
  } catch {
    notes.push("threads database unreadable — usage unknown");
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }
  try {
    let rows: { data: unknown; data_type?: unknown }[];
    try {
      rows = db.prepare("SELECT data, data_type FROM threads").all() as { data: unknown; data_type?: unknown }[];
    } catch {
      rows = db.prepare("SELECT data FROM threads").all() as { data: unknown }[];
    }
    for (const row of rows) {
      const text = decodeThread(row.data, row.data_type);
      if (text === null) continue;
      const updated = threadUpdatedMs(text);
      if (updated !== null && updated < cutoff) continue;
      conversations++;
      if (!text.includes("SKILL.md")) continue;
      sawSkillSystem = true;
      for (const match of text.matchAll(SKILL_PATH_RE)) {
        const name = match[1].toLowerCase();
        const prev = usage.get(name) ?? { count: 0 };
        prev.count += 1;
        usage.set(name, prev);
      }
    }
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }

  notes.push(`scanned Zed threads database (${conversations} thread(s) in window)`);
  if (!sawSkillSystem) {
    notes.push("no skill invocations recorded in threads — usage unknown");
    return { usage: new Map(), usageAvailable: false, conversationCount: conversations, notes };
  }
  notes.push("usage = SKILL.md path references in thread payloads (best effort)");
  return { usage, usageAvailable: true, conversationCount: conversations, notes };
}

/** Current Zed compresses `data` with zstd; legacy rows are plain JSON. */
function decodeThread(data: unknown, dataType: unknown): string | null {
  if (typeof data === "string" && dataType !== "zstd") return data;
  if (typeof data !== "string" && !(data instanceof Uint8Array)) return null;
  const bytes = Buffer.from(data as Uint8Array);
  if (dataType === "zstd") {
    const decompress = (zlib as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;
    if (!decompress) return null; // Node < 22.15 — thread skipped, coverage noted
    try {
      return decompress(bytes).toString("utf8");
    } catch {
      return null;
    }
  }
  return bytes.toString("utf8");
}

/** `updated_at` inside the thread JSON is epoch-ms or ISO; null when absent. */
function threadUpdatedMs(text: string): number | null {
  const start = text.indexOf('"updated_at"');
  if (start < 0) return null;
  const slice = text.slice(start, start + 64);
  // real threads carry 13-digit epoch-ms; any smaller number is necessarily
  // before the cutoff, so a plain integer match is enough
  const numeric = slice.match(/"updated_at"\s*:\s*(\d+(?:\.\d+)?)/);
  if (numeric) return Number(numeric[1]);
  const iso = slice.match(/"updated_at"\s*:\s*"([^"]+)"/);
  if (iso) {
    const ms = Date.parse(iso[1]);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
