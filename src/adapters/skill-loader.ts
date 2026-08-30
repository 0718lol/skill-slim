import * as path from "node:path";
import type { AgentId, ContextFile, Skill, SkillSource } from "../types.ts";
import { listDirs, listFiles, readFileSafe } from "../util/fsx.ts";
import { parseFrontmatter } from "../util/frontmatter.ts";

export interface DirWithSource {
  dir: string;
  source: SkillSource;
}

/**
 * Load `<dir>/<skill-name>/SKILL.md` skills from a list of roots.
 * Missing roots are skipped silently — every adapter runs on machines where
 * only some of its locations exist.
 */
export async function loadSkillDirs(
  agent: AgentId,
  roots: DirWithSource[],
  skillFile = "SKILL.md",
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const { dir, source } of roots) {
    for (const skillDir of await listDirs(dir)) {
      if (seen.has(skillDir)) continue;
      seen.add(skillDir);
      const file = path.join(skillDir, skillFile);
      const raw = await readFileSafe(file);
      if (raw === null) continue;
      const { data, body } = parseFrontmatter(raw);
      const dirname = path.basename(skillDir);
      skills.push({
        agent,
        name: data.name || dirname,
        dirName: dirname,
        description: data.description || "",
        body,
        path: skillDir,
        source,
      });
    }
  }
  return skills;
}

export interface FileWithLabel {
  file: string;
  label: string;
  source: SkillSource;
}

export async function loadContextFiles(
  agent: AgentId,
  entries: { file: string; label: string }[],
): Promise<ContextFile[]> {
  const out: ContextFile[] = [];
  const seen = new Set<string>();
  for (const { file, label } of entries) {
    if (seen.has(file)) continue;
    seen.add(file);
    const content = await readFileSafe(file);
    if (content !== null) out.push({ agent, label, path: file, content });
  }
  return out;
}

/** Load flat `*.md` prompt files (Codex-style) as individually-invoked skills. */
export async function loadPromptFiles(agent: AgentId, dir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  for (const file of await listFiles(dir, ".md")) {
    const raw = await readFileSafe(file);
    if (raw === null) continue;
    const { data, body } = parseFrontmatter(raw);
    const name = path.basename(file, ".md");
    const firstLine =
      body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#")) || "";
    skills.push({
      agent,
      name,
      description: data.description || firstLine.slice(0, 200),
      body,
      path: file,
      source: "global",
    });
  }
  return skills;
}
