import * as path from "node:path";
import type { AgentId, AgentScan, ContextFile } from "../types.ts";
import { exists, readFileSafe } from "../util/fsx.ts";
import { loadPromptFiles, loadSkillDirs } from "./skill-loader.ts";

/**
 * opencode keeps config under XDG (~/.config/opencode). It loads skills from
 * its own skills/ root plus two compatibility roots it also reads:
 * ~/.claude/skills and ~/.agents/skills (the cross-agent standard). Commands
 * are slash-invoked markdown prompts. Instructions: global AGENTS.md with a
 * ~/.claude/CLAUDE.md fallback, project AGENTS.md with a CLAUDE.md fallback —
 * first match wins per category.
 */
export const opencodeAdapter = {
  id: "opencode" as AgentId,
  name: "opencode",
  hint: "~/.config/opencode",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".config", "opencode"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const configDir = path.join(ctx.home, ".config", "opencode");
    const notes: string[] = [];
    const detected = (await this.detect({ home: ctx.home })) || (await exists(path.join(ctx.cwd, ".opencode")));
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

    const own = await loadSkillDirs(this.id, [
      { dir: path.join(configDir, "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".opencode", "skills"), source: "project" },
    ]);
    // opencode also loads Claude and cross-agent-standard skills; counting them
    // here keeps opencode's always-on bill honest about what it really carries.
    const compat = await loadSkillDirs(this.id, [
      { dir: path.join(ctx.home, ".claude", "skills"), source: "global" },
      { dir: path.join(ctx.home, ".agents", "skills"), source: "global" },
      { dir: path.join(ctx.cwd, ".claude", "skills"), source: "project" },
      { dir: path.join(ctx.cwd, ".agents", "skills"), source: "project" },
    ]);
    if (compat.length > 0) {
      notes.push(`${compat.length} skill(s) via ~/.claude and ~/.agents compatibility roots`);
    }

    const commands = [
      ...(await loadPromptFiles(this.id, path.join(configDir, "commands"))),
      ...(await loadPromptFiles(this.id, path.join(ctx.cwd, ".opencode", "commands"), "project")),
    ];

    const instructions = await instructionFiles(this.id, ctx.home, ctx.cwd);

    notes.push("usage unknown — opencode session storage is not parsed yet");
    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills: [...own, ...compat, ...commands],
      instructions,
      usage: new Map(),
      usageAvailable: false,
      conversationCount: 0,
      notes,
    };
  },
};

/** Global AGENTS.md falls back to ~/.claude/CLAUDE.md; project AGENTS.md to CLAUDE.md. */
async function instructionFiles(agent: AgentId, home: string, cwd: string): Promise<ContextFile[]> {
  const globalPairs: [string, string][] = [
    [path.join(home, ".config", "opencode", "AGENTS.md"), "global AGENTS.md"],
    [path.join(home, ".claude", "CLAUDE.md"), "global CLAUDE.md (fallback)"],
  ];
  const projectPairs: [string, string][] = [
    [path.join(cwd, "AGENTS.md"), "project AGENTS.md"],
    [path.join(cwd, "CLAUDE.md"), "project CLAUDE.md (fallback)"],
  ];
  const out: ContextFile[] = [];
  for (const pairs of [globalPairs, projectPairs]) {
    for (const [file, label] of pairs) {
      const content = await readFileSafe(file);
      if (content !== null) {
        out.push({ agent, label, path: file, content });
        break; // first matching file wins per category
      }
    }
  }
  return out;
}
