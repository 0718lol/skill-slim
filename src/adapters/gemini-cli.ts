import * as path from "node:path";
import type { AgentId, AgentScan, UsageStat } from "../types.ts";
import { exists, listDirs, listFiles, readFileSafe } from "../util/fsx.ts";
import { scanSqliteDbs } from "../util/sqlite-scan.ts";
import { loadContextFiles, loadSkillDirs } from "./skill-loader.ts";

const MAX_EXTENSION_CONTEXT_FILES = 30;

export const geminiCliAdapter = {
  id: "gemini-cli" as AgentId,
  name: "Gemini CLI",
  hint: "~/.gemini",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".gemini"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const geminiDir = path.join(ctx.home, ".gemini");
    const notes: string[] = [];
    const detected = await exists(geminiDir);
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

    // newer layouts keep skills under config/, older ones at the top level
    const skills = await loadSkillDirs(this.id, [
      { dir: path.join(geminiDir, "config", "skills"), source: "global" },
      { dir: path.join(geminiDir, "skills"), source: "global" },
    ]);

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(geminiDir, "GEMINI.md"), label: "global GEMINI.md" },
      { file: path.join(geminiDir, "config", "GEMINI.md"), label: "global config/GEMINI.md" },
      { file: path.join(ctx.cwd, "GEMINI.md"), label: "project GEMINI.md" },
      { file: path.join(ctx.cwd, ".gemini", "GEMINI.md"), label: "project .gemini/GEMINI.md" },
    ]);

    // Extensions ship context markdown that is loaded whenever enabled.
    const extDirs = await listDirs(path.join(geminiDir, "extensions"));
    let extFiles = 0;
    for (const extDir of extDirs) {
      const extName = path.basename(extDir);
      for (const mdFile of await collectMarkdown(extDir, 2)) {
        if (extFiles >= MAX_EXTENSION_CONTEXT_FILES) break;
        const content = await readFileSafe(mdFile);
        if (content === null) continue;
        instructions.push({
          agent: this.id,
          label: `extension ${extName}/${path.basename(mdFile)}`,
          path: mdFile,
          content,
        });
        extFiles++;
      }
    }
    if (extDirs.length > 0) {
      notes.push(`${extDirs.length} extension(s), ${extFiles} context file(s) counted`);
    }

    const { usage, usageAvailable, conversationCount, notes: usageNotes } = await parseUsage(geminiDir, ctx.windowDays);
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

/**
 * Gemini usage evidence lives in Antigravity conversation databases
 * (~/.gemini/antigravity/conversations/*.db). Counts are gated on seeing the
 * skill system referenced at all — these schemas log skill loads only
 * sometimes, and an all-zero scan must read as "unknown", not "unused".
 */
async function parseUsage(
  geminiDir: string,
  windowDays: number,
): Promise<{ usage: Map<string, UsageStat>; usageAvailable: boolean; conversationCount: number; notes: string[] }> {
  const notes: string[] = [];
  const conversationsDir = path.join(geminiDir, "antigravity", "conversations");
  const dbFiles = [...(await listFiles(conversationsDir, ".db"))];
  if (dbFiles.length === 0) {
    notes.push("no Antigravity conversation databases found");
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }

  const result = await scanSqliteDbs(
    dbFiles,
    ["SELECT step_payload, metadata FROM steps", "SELECT data FROM gen_metadata"],
    "SELECT COUNT(*) AS c FROM trajectory_meta",
    Date.now() - windowDays * 24 * 3600 * 1000,
  );

  if (result.opened === 0) {
    notes.push(`could not open any of ${dbFiles.length} conversation database(s)`);
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }

  notes.push(
    `scanned ${result.opened} conversation database(s)` +
      (result.failed > 0 ? ` (${result.failed} unreadable)` : ""),
  );
  if (!result.sawSkillSystem) {
    notes.push("no skill invocations recorded in local conversations — usage unknown");
    return { usage: new Map(), usageAvailable: false, conversationCount: result.conversations, notes };
  }
  notes.push("usage = SKILL.md path references in conversation payloads (best effort)");
  return { usage: result.hits, usageAvailable: true, conversationCount: result.conversations, notes };
}

async function collectMarkdown(dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const out = await listFiles(dir, ".md");
  for (const child of await listDirs(dir)) {
    out.push(...(await collectMarkdown(child, maxDepth - 1)));
  }
  return out;
}
