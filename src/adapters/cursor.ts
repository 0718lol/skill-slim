import * as path from "node:path";
import type { AgentId, AgentScan, Skill } from "../types.ts";
import { exists, listFiles, readFileSafe } from "../util/fsx.ts";
import { findTimestampColumn, scanSqliteDbs } from "../util/sqlite-scan.ts";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { loadContextFiles } from "./skill-loader.ts";

/**
 * Cursor rules live in `.cursor/rules/*.mdc` (project) and `~/.cursor/rules`
 * (user). Rules with `alwaysApply: true` are always-loaded context; the rest
 * behave like conditionally-invoked skills. Usage: Cursor doesn't log rule
 * invocations locally, but its ai-tracking database provides conversation
 * counts that power the monthly always-on bill.
 */
export const cursorAdapter = {
  id: "cursor" as AgentId,
  name: "Cursor",
  hint: "~/.cursor",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".cursor"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const cursorDir = path.join(ctx.home, ".cursor");
    const notes: string[] = [];
    const detected = (await exists(cursorDir)) || (await exists(path.join(ctx.cwd, ".cursor")));
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

    const skills: Skill[] = [];
    // merge global/project rule files first so identical paths (e.g. home used
    // as cwd) are only counted once, global wins
    const ruleFiles = new Map<string, string>();
    for (const file of await listFiles(path.join(cursorDir, "rules"), ".mdc")) {
      if (!ruleFiles.has(file)) ruleFiles.set(file, "global");
    }
    for (const file of await listFiles(path.join(ctx.cwd, ".cursor", "rules"), ".mdc")) {
      if (!ruleFiles.has(file)) ruleFiles.set(file, "project");
    }

    for (const [file, source] of ruleFiles) {
      const raw = await readFileSafe(file);
      if (raw === null) continue;
      const { data, body } = parseFrontmatter(raw);
      const name = data.name || path.basename(file, ".mdc");
      if (data.alwaysapply === "true") continue; // counted as context below
      skills.push({
        agent: this.id,
        name,
        dirName: name,
        description: data.description || "",
        body,
        path: file,
        source: source as Skill["source"],
      });
    }

    const instructions = await loadContextFiles(this.id, []);
    for (const [file, source] of ruleFiles) {
      const raw = await readFileSafe(file);
      if (raw === null) continue;
      const { data } = parseFrontmatter(raw);
      if (data.alwaysapply !== "true") continue;
      instructions.push({
        agent: this.id,
        label: `${source} rule (always-apply) ${path.basename(file)}`,
        path: file,
        content: raw,
      });
    }

    const mcpCount = await countMcpServers([
      path.join(cursorDir, "mcp.json"),
      path.join(ctx.cwd, ".cursor", "mcp.json"),
    ]);
    if (mcpCount > 0) {
      notes.push(`${mcpCount} MCP server(s) configured (tool definitions not priced in v1)`);
    }

    const { conversationCount, notes: usageNotes } = await parseConversationCount(cursorDir, ctx.windowDays);
    notes.push(...usageNotes);

    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage: new Map(),
      usageAvailable: false,
      conversationCount,
      notes,
    };
  },
};

/**
 * Conversation counts come from ~/.cursor/ai-tracking/ai-code-tracking.db
 * (conversation_summaries). The timestamp column name varies between Cursor
 * builds, so it's discovered via PRAGMA and the query degrades to "all rows"
 * when there is none.
 */
async function parseConversationCount(
  cursorDir: string,
  windowDays: number,
): Promise<{ conversationCount: number; notes: string[] }> {
  const notes: string[] = [];
  const dbPath = path.join(cursorDir, "ai-tracking", "ai-code-tracking.db");
  if (!(await exists(dbPath))) {
    notes.push("no ai-tracking database found");
    return { conversationCount: 0, notes };
  }
  const timeCol = await findTimestampColumn(dbPath, "conversation_summaries");
  const cutoffMs = Date.now() - windowDays * 24 * 3600 * 1000;
  const where = timeCol ? `WHERE ${timeCol} >= ${cutoffMs}` : "";
  const result = await scanSqliteDbs(
    [dbPath],
    [],
    `SELECT COUNT(*) AS c FROM conversation_summaries ${where}`,
    cutoffMs,
    { skipMtimeFilter: true },
  );
  if (result.opened === 0) {
    notes.push("ai-tracking database exists but could not be opened");
    return { conversationCount: 0, notes };
  }
  if (result.conversations > 0) {
    notes.push(
      `${result.conversations} conversation(s) in the last ${windowDays} days power the monthly bill; ` +
        `rule usage isn't logged locally`,
    );
  } else {
    notes.push("no conversations recorded in ai-tracking; rule usage isn't logged locally");
  }
  return { conversationCount: result.conversations, notes };
}

async function countMcpServers(files: string[]): Promise<number> {
  let count = 0;
  for (const file of files) {
    const raw = await readFileSafe(file);
    if (raw === null) continue;
    try {
      const json = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
      count += Object.keys(json.mcpServers ?? {}).length;
    } catch {
      // malformed mcp.json — ignore
    }
  }
  return count;
}
