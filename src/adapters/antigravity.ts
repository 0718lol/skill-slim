import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type { AgentId, AgentScan, ContextFile, UsageStat } from "../types.ts";
import { exists, listDirs, listFiles, readFileSafe } from "../util/fsx.ts";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { scanSqliteDbs } from "../util/sqlite-scan.ts";
import { loadContextFiles, loadSkillDirs, type DirWithSource } from "./skill-loader.ts";

const MAX_RULE_FILES = 60;

/**
 * A real skill load: a view_file / read_file tool call on a SKILL.md path, as
 * stored in `steps.step_payload`. Bare path mentions do NOT count — every
 * conversation's system prompt lists all skills as `- name (…/SKILL.md): …`,
 * and `find` output or file writes mention SKILL.md paths without loading them.
 */
export const ANTIGRAVITY_SKILL_CALL_RE =
  /\b(?:view_file|read_file)[^{]{0,40}\{"(?:AbsolutePath|Path|path|file_path)":"[^"]*?\/skills\/([A-Za-z0-9_.-]+)\/SKILL\.md"/g;

/**
 * Google Antigravity. It shares ~/.gemini with Gemini CLI but is a separate
 * agent with its own layout:
 *
 *   ~/.gemini/antigravity/            app data (conversations, builtin skills)
 *   ~/.gemini/config/config.json      installed plugins (+ settings)
 *   ~/.gemini/config/plugins/<p>/     plugin payloads: skills/, rules/
 *   ~/.gemini/config/skills/          user skills
 *   ~/.gemini/config/rules/*.md       user rules (frontmatter `trigger:`)
 *   <cwd>/.agent(s)/{skills,rules}/   workspace skills and rules
 *
 * Rules with `trigger: always_on` ride along in every conversation and are
 * billed as instructions; model_decision / glob / manual rules load on demand
 * and are only counted in a note.
 */
export const antigravityAdapter = {
  id: "antigravity" as AgentId,
  name: "Antigravity",
  hint: "~/.gemini/antigravity",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".gemini", "antigravity"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const geminiDir = path.join(ctx.home, ".gemini");
    const appDir = path.join(geminiDir, "antigravity");
    const configDir = path.join(geminiDir, "config");
    const notes: string[] = [];
    if (!(await exists(appDir))) {
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

    const plugins = await installedPlugins(configDir);
    if (plugins.skipped > 0) notes.push(`skipped ${plugins.skipped} plugin folder(s) not installed or disabled in config.json`);

    const builtinPlugins = await listDirs(path.join(appDir, "builtin", "plugins"));
    const roots: DirWithSource[] = [
      { dir: path.join(configDir, "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".agent", "skills"), source: "project" },
      { dir: path.join(ctx.cwd, ".agents", "skills"), source: "project" },
      // shipped with the app; the user can't remove them, so treat as bundled
      { dir: path.join(appDir, "builtin", "skills"), source: "plugin" },
      ...builtinPlugins.map((p) => ({ dir: path.join(p, "skills"), source: "plugin" as const })),
      ...plugins.dirs.map((p) => ({ dir: path.join(p, "skills"), source: "plugin" as const })),
    ];
    const skills = await loadSkillDirs(this.id, roots);
    if (plugins.dirs.length > 0) notes.push(`found skills in ${plugins.dirs.length} plugin bundle(s)`);

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(geminiDir, "GEMINI.md"), label: "global GEMINI.md" },
      { file: path.join(ctx.cwd, "GEMINI.md"), label: "project GEMINI.md" },
    ]);
    const rules = await loadAlwaysOnRules(this.id, [
      { dir: path.join(configDir, "rules"), label: "rule" },
      { dir: path.join(ctx.cwd, ".agent", "rules"), label: "project rule" },
      { dir: path.join(ctx.cwd, ".agents", "rules"), label: "project rule" },
      ...plugins.dirs.map((p) => ({ dir: path.join(p, "rules"), label: `plugin ${path.basename(p)} rule` })),
    ]);
    instructions.push(...rules.alwaysOn);
    if (rules.onDemand > 0) notes.push(`${rules.onDemand} on-demand rule(s) not billed (model_decision / glob / manual)`);

    const usage = await parseUsage(appDir, ctx.windowDays);
    notes.push(...usage.notes);

    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage: usage.usage,
      usageAvailable: usage.usageAvailable,
      conversationCount: usage.conversationCount,
      notes,
    };
  },
};

/**
 * Plugin folders listed in config.json `plugins` (an entry may carry
 * `enabled: false` / `disabled: true`). Without a readable config.json every
 * plugin folder counts, matching the pre-resolution behaviour.
 */
async function installedPlugins(configDir: string): Promise<{ dirs: string[]; skipped: number }> {
  const onDisk = await listDirs(path.join(configDir, "plugins"));
  let config: { plugins?: Record<string, { enabled?: unknown; disabled?: unknown }> } | undefined;
  try {
    config = JSON.parse(await fsp.readFile(path.join(configDir, "config.json"), "utf8"));
  } catch {
    config = undefined;
  }
  const listed = config?.plugins;
  if (!listed || typeof listed !== "object") return { dirs: onDisk, skipped: 0 };
  const dirs: string[] = [];
  let skipped = 0;
  for (const dir of onDisk) {
    const entry = listed[path.basename(dir)];
    if (entry && entry.enabled !== false && entry.disabled !== true) dirs.push(dir);
    else skipped++;
  }
  return { dirs, skipped };
}

async function loadAlwaysOnRules(
  agent: AgentId,
  dirs: { dir: string; label: string }[],
): Promise<{ alwaysOn: ContextFile[]; onDemand: number }> {
  const alwaysOn: ContextFile[] = [];
  let onDemand = 0;
  let seen = 0;
  const contents = new Set<string>();
  for (const { dir, label } of dirs) {
    const files = [...(await listFiles(dir, ".md")), ...(await listFiles(dir, ".mdc"))].sort();
    for (const file of files) {
      if (seen++ >= MAX_RULE_FILES) return { alwaysOn, onDemand };
      const content = await readFileSafe(file);
      if (content === null) continue;
      const trigger = (parseFrontmatter(content).data.trigger ?? "").trim().toLowerCase();
      if (trigger !== "always_on") {
        onDemand++;
        continue;
      }
      // plugins sometimes ship the same rule as .md and .mdc; load it once
      if (contents.has(content)) continue;
      contents.add(content);
      alwaysOn.push({ agent, label: `${label} ${path.basename(file)}`, path: file, content });
    }
  }
  return { alwaysOn, onDemand };
}

/**
 * Usage evidence lives in the conversation databases
 * (~/.gemini/antigravity/conversations/*.db): skill-file reads in the step
 * log. `gen_metadata` is skipped on purpose — it holds the prompt, whose skill
 * catalog names every installed skill. Counts are gated on seeing at least one
 * real skill read; an all-zero scan reads as "unknown", not "unused".
 */
async function parseUsage(
  appDir: string,
  windowDays: number,
): Promise<{ usage: Map<string, UsageStat>; usageAvailable: boolean; conversationCount: number; notes: string[] }> {
  const notes: string[] = [];
  const dbFiles = await listFiles(path.join(appDir, "conversations"), ".db");
  if (dbFiles.length === 0) {
    notes.push("no Antigravity conversation databases found");
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }

  const result = await scanSqliteDbs(
    dbFiles,
    ["SELECT step_payload FROM steps"],
    "SELECT COUNT(*) AS c FROM trajectory_meta",
    Date.now() - windowDays * 24 * 3600 * 1000,
    { pattern: ANTIGRAVITY_SKILL_CALL_RE },
  );

  if (result.opened === 0) {
    notes.push(`could not open any of ${dbFiles.length} conversation database(s)`);
    return { usage: new Map(), usageAvailable: false, conversationCount: 0, notes };
  }

  notes.push(`scanned ${result.opened} conversation database(s)` + (result.failed > 0 ? ` (${result.failed} unreadable)` : ""));
  if (!result.sawSkillSystem) {
    notes.push("no skill invocations recorded in local conversations — usage unknown");
    return { usage: new Map(), usageAvailable: false, conversationCount: result.conversations, notes };
  }
  notes.push("usage = view_file / read_file calls on SKILL.md in the step log (best effort)");
  return { usage: result.hits, usageAvailable: true, conversationCount: result.conversations, notes };
}
