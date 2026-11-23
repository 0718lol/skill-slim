import { promises as fsp } from "node:fs";
import * as path from "node:path";
import { exists, findNamedDirs, listDirs } from "../util/fsx.ts";

/**
 * Which plugin skill folders an agent actually loads.
 *
 * Agents keep far more on disk than they load: Codex caches every plugin it
 * has ever fetched, per marketplace and per version, under
 * ~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/; Claude Code
 * clones whole marketplaces (every plugin in the catalog) under
 * ~/.claude/plugins/marketplaces/. Counting all of that inflated skill
 * counts, the always-on bill and produced "duplicates" that were really one
 * plugin sitting in two caches. The resolvers below follow the agent's own
 * enabled/installed records and return null when those records are absent,
 * so callers can fall back to the old directory walk.
 */
export interface PluginResolution {
  /** skills/ folders of enabled plugins (newest version only) */
  roots: string[];
  /** plugins present on disk but not enabled — skipped */
  skipped: number;
}

/** compare "1.0.109" / "26.1117.41037" style versions; non-numeric parts sort lexically */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    const c = !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * `[plugins."name@marketplace"]` tables from a Codex config.toml and whether
 * each is enabled (a table without an `enabled` key counts as enabled).
 * Deliberately minimal: only the table headers and the `enabled` key matter.
 */
export function parseCodexPluginTables(toml: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  let current: string | null = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (line.startsWith("[")) {
      const m = /^\[\s*plugins\.(?:"([^"]+)"|'([^']+)')\s*\]$/.exec(line);
      current = m ? (m[1] ?? m[2]) : null;
      if (current) out.set(current, true);
      continue;
    }
    const kv = current && /^enabled\s*=\s*(true|false)$/.exec(line);
    if (kv && current) out.set(current, kv[1] === "true");
  }
  return out;
}

/** skills/ folder of the newest cached version under one plugin directory */
async function newestSkillsDir(pluginDir: string): Promise<string | null> {
  const direct = path.join(pluginDir, "skills");
  if (await exists(direct)) return direct;
  const versions = (await listDirs(pluginDir))
    .map((d) => path.basename(d))
    .sort((a, b) => compareVersions(b, a));
  for (const v of versions) {
    const dir = path.join(pluginDir, v, "skills");
    if (await exists(dir)) return dir;
  }
  return null;
}

export async function resolveCodexPlugins(codexDir: string): Promise<PluginResolution | null> {
  let toml: string;
  try {
    toml = await fsp.readFile(path.join(codexDir, "config.toml"), "utf8");
  } catch {
    return null;
  }
  const tables = parseCodexPluginTables(toml);
  if (tables.size === 0) return null;

  const cache = path.join(codexDir, "plugins", "cache");
  const roots: string[] = [];
  let skipped = 0;
  for (const marketDir of await listDirs(cache)) {
    const market = path.basename(marketDir);
    for (const pluginDir of await listDirs(marketDir)) {
      const id = `${path.basename(pluginDir)}@${market}`;
      if (tables.get(id) !== true) {
        if ((await findNamedDirs(pluginDir, "skills", 3, 1)).length > 0) skipped++;
        continue;
      }
      const dir = await newestSkillsDir(pluginDir);
      if (dir) roots.push(dir);
    }
  }
  return { roots, skipped };
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

interface ClaudeInstall {
  installPath?: string;
  scope?: string;
  projectPath?: string;
}

/**
 * Claude Code: ~/.claude/plugins/installed_plugins.json lists what is
 * installed (v1: one record per plugin, v2: an array of per-scope records);
 * `enabledPlugins` in user / project / local settings switches them on or
 * off, later files winning. A plugin missing from every enabledPlugins map
 * counts as enabled, which is what installing it does.
 */
export async function resolveClaudePlugins(claudeDir: string, cwd: string): Promise<PluginResolution | null> {
  const installed = (await readJson(path.join(claudeDir, "plugins", "installed_plugins.json"))) as
    | { plugins?: Record<string, ClaudeInstall | ClaudeInstall[]> }
    | undefined;
  if (!installed || typeof installed.plugins !== "object" || installed.plugins === null) return null;

  const enabled = new Map<string, boolean>();
  for (const file of [
    path.join(claudeDir, "settings.json"),
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json"),
  ]) {
    const settings = (await readJson(file)) as { enabledPlugins?: Record<string, unknown> } | undefined;
    for (const [id, on] of Object.entries(settings?.enabledPlugins ?? {})) enabled.set(id, on === true);
  }

  const roots: string[] = [];
  let skipped = 0;
  const here = path.resolve(cwd);
  for (const [id, value] of Object.entries(installed.plugins)) {
    const records = (Array.isArray(value) ? value : [value]).filter(
      (r) => r && typeof r.installPath === "string" &&
        // project/local installs only apply inside that project
        (!r.projectPath || (r.scope !== "project" && r.scope !== "local") || path.resolve(r.projectPath) === here),
    );
    if (records.length === 0) continue;
    if (enabled.get(id) === false) {
      skipped++;
      continue;
    }
    const dir = path.join(records[records.length - 1].installPath!, "skills");
    if (await exists(dir)) roots.push(dir);
  }
  return { roots, skipped };
}
