import * as path from "node:path";
import type { AgentId, AgentScan } from "../types.ts";
import { exists, listDirs, listFiles, readFileSafe } from "../util/fsx.ts";
import { loadContextFiles, loadSkillDirs } from "./skill-loader.ts";

const MAX_EXTENSION_CONTEXT_FILES = 30;

/**
 * Files only Gemini CLI writes. ~/.gemini alone is not proof: Antigravity
 * keeps its data there too (~/.gemini/antigravity, ~/.gemini/config) and is
 * scanned by its own adapter. GEMINI.md is not a marker either — Antigravity
 * reads ~/.gemini/GEMINI.md as its global rules file.
 */
const GEMINI_CLI_MARKERS = ["settings.json", "extensions", "skills", "tmp", "oauth_creds.json", "google_accounts.json"];

export const geminiCliAdapter = {
  id: "gemini-cli" as AgentId,
  name: "Gemini CLI",
  hint: "~/.gemini (settings.json, extensions/, skills/)",

  async detect(ctx: { home: string }): Promise<boolean> {
    const geminiDir = path.join(ctx.home, ".gemini");
    for (const marker of GEMINI_CLI_MARKERS) {
      if (await exists(path.join(geminiDir, marker))) return true;
    }
    return false;
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const geminiDir = path.join(ctx.home, ".gemini");
    const notes: string[] = [];
    if (!(await this.detect(ctx))) {
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
      { dir: path.join(geminiDir, "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".gemini", "skills"), source: "project" },
    ]);

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(geminiDir, "GEMINI.md"), label: "global GEMINI.md" },
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

    // Gemini CLI keeps no skill-invocation log we can read, so usage stays
    // unknown and no skill is ever called unused.
    notes.push("no skill invocations recorded in Gemini CLI's local files — usage unknown");

    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage: new Map(),
      usageAvailable: false,
      conversationCount: 0,
      notes,
    };
  },
};

async function collectMarkdown(dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const out = await listFiles(dir, ".md");
  for (const child of await listDirs(dir)) {
    out.push(...(await collectMarkdown(child, maxDepth - 1)));
  }
  return out;
}
