import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type { AgentId, AgentScan, UsageStat } from "../types.ts";
import { exists, findNamedDirs, listDirs, listFiles, mtimes } from "../util/fsx.ts";
import { loadContextFiles, loadSkillDirs } from "./skill-loader.ts";

const MAX_SESSION_FILES = 2000;
const MAX_SESSION_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SESSION_BYTES = 500 * 1024 * 1024;

/**
 * Claude Code transcript lines containing a Skill invocation. Matches both
 * `{"name":"Skill","input":{"command":"..."}}` tool_use blocks and free-form
 * `"skill":"..."` mentions; good enough for usage counting.
 */
const COMMAND_RE = /"command"\s*:\s*"([^"]{1,120})"/g;
const SKILL_RE = /"skill"\s*:\s*"([^"]{1,120})"/g;

export const claudeCodeAdapter = {
  id: "claude-code" as AgentId,
  name: "Claude Code",
  hint: "~/.claude",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".claude"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const claudeDir = path.join(ctx.home, ".claude");
    const notes: string[] = [];
    const detected = await exists(claudeDir);
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

    const pluginSkillRoots = (await findNamedDirs(path.join(claudeDir, "plugins"), "skills", 5)).map((dir) => ({
      dir,
      source: "plugin" as const,
    }));
    // one call so identical paths (e.g. home used as cwd) are deduped across sources
    const skills = await loadSkillDirs(this.id, [
      { dir: path.join(claudeDir, "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".claude", "skills"), source: "project" },
      ...pluginSkillRoots,
    ]);
    if (pluginSkillRoots.length > 0) {
      notes.push(`found skills in ${pluginSkillRoots.length} plugin bundle(s)`);
    }

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(claudeDir, "CLAUDE.md"), label: "global CLAUDE.md" },
      { file: path.join(ctx.cwd, "CLAUDE.md"), label: "project CLAUDE.md" },
      { file: path.join(ctx.cwd, ".claude", "CLAUDE.md"), label: "project .claude/CLAUDE.md" },
    ]);

    const { usage, filesScanned } = await parseUsage(ctx.home, ctx.windowDays);
    if (filesScanned > 0) {
      notes.push(`parsed ${filesScanned} session file(s) from the last ${ctx.windowDays} days`);
    } else {
      notes.push(`no session transcripts found in the last ${ctx.windowDays} days`);
    }

    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage,
      usageAvailable: filesScanned > 0,
      conversationCount: filesScanned,
      notes,
    };
  },
};

async function parseUsage(
  userHome: string,
  windowDays: number,
): Promise<{ usage: Map<string, UsageStat>; filesScanned: number }> {
  const usage = new Map<string, UsageStat>();
  // transcripts live in ~/.claude/projects/<escaped-cwd>/*.jsonl
  const projectsDir = path.join(userHome, ".claude", "projects");
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;

  const jsonlFiles: string[] = [];
  for (const dir of await listDirs(projectsDir)) {
    jsonlFiles.push(...(await listFiles(dir, ".jsonl")));
  }
  if (jsonlFiles.length === 0) return { usage, filesScanned: 0 };

  const times = await mtimes(jsonlFiles);
  const recent = jsonlFiles
    .filter((f) => (times.get(f) ?? 0) >= cutoff)
    .sort((a, b) => (times.get(b) ?? 0) - (times.get(a) ?? 0))
    .slice(0, MAX_SESSION_FILES);

  let filesScanned = 0;
  let bytesRead = 0;
  for (const file of recent) {
    const session = await readSessionFile(file);
    if (session === null) continue;
    filesScanned++;
    bytesRead += session.bytes;
    if (session.raw.includes('"Skill"')) {
      for (const line of session.raw.split("\n")) {
        if (!line.includes('"Skill"')) continue;
        collectMatches(line, COMMAND_RE, usage);
        collectMatches(line, SKILL_RE, usage);
      }
    }
    if (bytesRead > MAX_TOTAL_SESSION_BYTES) break;
  }
  return { usage, filesScanned };
}

/** Session transcripts can exceed the general file cap; allow up to 10MB each. */
async function readSessionFile(file: string): Promise<{ raw: string; bytes: number } | null> {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile() || stat.size > MAX_SESSION_FILE_BYTES) return null;
    return { raw: await fsp.readFile(file, "utf8"), bytes: stat.size };
  } catch {
    return null;
  }
}

function collectMatches(line: string, re: RegExp, usage: Map<string, UsageStat>): void {
  for (const match of line.matchAll(re)) {
    const name = match[1].replace(/^\/+/, "").toLowerCase();
    if (!name) continue;
    const prev = usage.get(name) ?? { count: 0 };
    prev.count += 1;
    usage.set(name, prev);
  }
}
