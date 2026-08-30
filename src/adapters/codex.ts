import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type { AgentId, AgentScan, UsageStat } from "../types.ts";
import { exists, findFilesDeep, findNamedDirs, listFiles, mtimes } from "../util/fsx.ts";
import { loadContextFiles, loadPromptFiles, loadSkillDirs } from "./skill-loader.ts";

const MAX_SESSION_FILES = 3000;
const MAX_SESSION_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SESSION_BYTES = 500 * 1024 * 1024;

/**
 * Codex loads a skill by shelling out to read its SKILL.md, so exec inputs
 * mentioning `.../skills/<name>/SKILL.md` are a reliable invocation proxy.
 * Custom prompts are invoked as a leading slash command in the user message.
 * Only tool-call *inputs* are scanned — command outputs (ls dumps etc.)
 * overcount wildly.
 */
const SKILL_PATH_RE = /skills\/([A-Za-z0-9_.-]+)\/SKILL\.md/g;
const CODEX_SKILL_DIR_RE = /\.codex\/skills\/([A-Za-z0-9_.-]+)/g;
const SLASH_COMMAND_RE = /^\/([A-Za-z0-9_-]{2,64})(?:\s|$)/;

export const codexAdapter = {
  id: "codex" as AgentId,
  name: "Codex CLI",
  hint: "~/.codex",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".codex"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const codexDir = path.join(ctx.home, ".codex");
    const notes: string[] = [];
    const detected = await exists(codexDir);
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

    const pluginSkillRoots = (await findNamedDirs(path.join(codexDir, "plugins"), "skills", 6)).map((dir) => ({
      dir,
      source: "plugin" as const,
    }));
    const skills = [
      ...(await loadSkillDirs(this.id, [
        { dir: path.join(codexDir, "skills"), source: "global" },
        ...pluginSkillRoots,
      ])),
      ...(await loadPromptFiles(this.id, path.join(codexDir, "prompts"))),
    ];
    if (pluginSkillRoots.length > 0) {
      notes.push(`found skills in ${pluginSkillRoots.length} plugin bundle(s)`);
    }
    if (skills.some((s) => s.path.endsWith(".md") && !s.path.endsWith("SKILL.md"))) {
      notes.push("custom prompts are counted as skills");
    }

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(codexDir, "AGENTS.md"), label: "global AGENTS.md" },
      { file: path.join(ctx.cwd, "AGENTS.md"), label: "project AGENTS.md" },
    ]);

    const { usage, filesScanned } = await parseUsage(codexDir, ctx.windowDays);
    if (filesScanned > 0) {
      notes.push(`parsed ${filesScanned} session file(s) from the last ${ctx.windowDays} days`);
      notes.push("usage = exec calls reading a SKILL.md + leading slash commands (best effort)");
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
  codexDir: string,
  windowDays: number,
): Promise<{ usage: Map<string, UsageStat>; filesScanned: number }> {
  const usage = new Map<string, UsageStat>();
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;

  const sessionFiles = [
    ...(await findFilesDeep(path.join(codexDir, "sessions"), ".jsonl", 6)),
    ...(await listFiles(path.join(codexDir, "archived_sessions"), ".jsonl")),
  ];
  if (sessionFiles.length === 0) return { usage, filesScanned: 0 };

  const times = await mtimes(sessionFiles);
  const recent = sessionFiles
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
    for (const line of session.raw.split("\n")) {
      collectFromLine(line, usage);
    }
    if (bytesRead > MAX_TOTAL_SESSION_BYTES) break;
  }
  return { usage, filesScanned };
}

async function readSessionFile(file: string): Promise<{ raw: string; bytes: number } | null> {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile() || stat.size > MAX_SESSION_FILE_BYTES) return null;
    return { raw: await fsp.readFile(file, "utf8"), bytes: stat.size };
  } catch {
    return null;
  }
}

function collectFromLine(line: string, usage: Map<string, UsageStat>): void {
  if (!line.includes('{"')) return;
  let rec: {
    type?: string;
    payload?: { type?: string; name?: string; input?: unknown; message?: unknown };
  };
  try {
    rec = JSON.parse(line);
  } catch {
    return;
  }
  const payload = rec.payload;
  if (!payload) return;

  if (payload.type === "custom_tool_call" || payload.type === "function_call") {
    const inputText = typeof payload.input === "string" ? payload.input : JSON.stringify(payload.input ?? "");
    if (!inputText.includes("SKILL.md") && !inputText.includes(".codex/skills/")) return;
    for (const re of [SKILL_PATH_RE, CODEX_SKILL_DIR_RE]) {
      for (const match of inputText.matchAll(re)) {
        bump(match[1], usage);
      }
    }
    return;
  }

  if (rec.type === "event_msg" && payload.type === "user_message") {
    const message = typeof payload.message === "string" ? payload.message : "";
    const slash = SLASH_COMMAND_RE.exec(message);
    if (slash) bump(slash[1], usage);
  }
}

function bump(name: string, usage: Map<string, UsageStat>): void {
  const key = name.toLowerCase();
  if (!key) return;
  const prev = usage.get(key) ?? { count: 0 };
  prev.count += 1;
  usage.set(key, prev);
}
