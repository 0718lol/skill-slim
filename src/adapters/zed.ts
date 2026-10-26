import * as path from "node:path";
import type { AgentId, AgentScan } from "../types.ts";
import { exists } from "../util/fsx.ts";
import { loadContextFiles, loadSkillDirs } from "./skill-loader.ts";

/**
 * Zed (v1.4+) reads skills from the cross-agent standard roots
 * ~/.agents/skills/ and <project>/.agents/skills/ (flat layout, SKILL.md per
 * folder) and always-on instructions from ~/.config/zed/AGENTS.md plus project
 * AGENTS.md. Note: the skills roots are shared with other agents that read
 * the same standard, so the same folder can legitimately appear in several
 * agents' bills.
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

    notes.push("usage unknown — Zed does not log skill invocations locally");
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
