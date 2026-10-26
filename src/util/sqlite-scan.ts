import { DatabaseSync } from "node:sqlite";
import type { UsageStat } from "../types.ts";
import { mtimes } from "./fsx.ts";

export interface SqliteUsage {
  /** Skill name (lowercase) -> path-pattern hits across all databases. */
  hits: Map<string, UsageStat>;
  /** Result of the caller's conversation-count query, summed over databases. */
  conversations: number;
  /** True when any `SKILL.md` reference was seen — proof the skill system is
   *  actually logged in these databases. Without this gate, an all-zero scan
   *  would falsely condemn every installed skill as unused. */
  sawSkillSystem: boolean;
  opened: number;
  failed: number;
}

/** `skills/<name>/SKILL.md` reference — the shared invocation proxy. */
export const SKILL_PATH_RE = /\bskills\/([A-Za-z0-9_.-]+)\/SKILL\.md\b/g;
const MAX_DB_FILES = 500;
const MAX_ROWS_PER_QUERY = 50_000;
const MAX_VALUE_BYTES = 20 * 1024 * 1024;

/**
 * Read-only SQLite scanner for agent conversation databases. Runs the caller's
 * row queries and counts `skills/<name>/SKILL.md` path references in every
 * text/blob value — the same invocation proxy used for Codex sessions. Never
 * writes: databases are opened with readOnly and any failure just decrements
 * coverage instead of failing the scan.
 */
export async function scanSqliteDbs(
  files: string[],
  queries: string[],
  conversationsQuery: string | null,
  cutoffMs: number,
  opts?: { skipMtimeFilter?: boolean },
): Promise<SqliteUsage> {
  const usage: SqliteUsage = { hits: new Map(), conversations: 0, sawSkillSystem: false, opened: 0, failed: 0 };

  // cumulative databases (a single tracking file updated in place) must not be
  // skipped for being old — per-conversation files want the mtime window
  const times = opts?.skipMtimeFilter ? new Map<string, number>() : await mtimes(files);
  const recent = opts?.skipMtimeFilter
    ? files.slice(0, MAX_DB_FILES)
    : files.filter((f) => (times.get(f) ?? 0) >= cutoffMs).slice(0, MAX_DB_FILES);
  if (recent.length === 0) return usage;

  for (const file of recent) {
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(file, { readOnly: true });
    } catch {
      usage.failed++;
      continue;
    }
    try {
      for (const query of queries) {
        let rows;
        try {
          rows = db.prepare(`${query} LIMIT ${MAX_ROWS_PER_QUERY}`).all();
        } catch {
          continue; // table/columns not present in this schema version
        }
        for (const row of rows) {
          for (const value of Object.values(row)) {
            const text = toSearchable(value);
            if (!text || !text.includes("SKILL.md")) continue;
            usage.sawSkillSystem = true;
            for (const match of text.matchAll(SKILL_PATH_RE)) {
              const name = match[1].toLowerCase();
              const prev = usage.hits.get(name) ?? { count: 0 };
              prev.count += 1;
              usage.hits.set(name, prev);
            }
          }
        }
      }
      if (conversationsQuery) {
        try {
          const row = db.prepare(`${conversationsQuery} LIMIT 1`).get() as { c?: number } | undefined;
          usage.conversations += Number(row?.c ?? 0);
        } catch {
          // conversations unknown for this database
        }
      }
      usage.opened++;
    } finally {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
  }
  return usage;
}

function toSearchable(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array && value.byteLength <= MAX_VALUE_BYTES) {
    return Buffer.from(value).toString("utf8");
  }
  return null;
}

/**
 * Find a timestamp-like column on a table so conversation counts can be
 * windowed; returns null when the schema has none.
 */
export async function findTimestampColumn(dbPath: string, table: string): Promise<string | null> {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const match = rows.map((r) => r.name).find((n) => /time|created|date/i.test(n));
    return match ?? null;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
}
