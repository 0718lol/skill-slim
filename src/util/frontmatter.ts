/**
 * Minimal frontmatter parser for SKILL.md / .mdc files. Covers the flat
 * `key: value` subset agents actually use (name, description, alwaysApply,
 * globs, ...); anything richer is ignored rather than mis-parsed.
 */
export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    data[kv[1].toLowerCase()] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}
