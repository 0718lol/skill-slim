/**
 * Minimal frontmatter parser for SKILL.md / .mdc files. Covers the flat
 * `key: value` subset agents actually use (name, description, alwaysApply,
 * globs, ...) plus the multi-line string forms skill authors commonly reach
 * for: YAML block scalars (`>`, `>-`, `|`, `|-`, `|+`) and indented plain
 * continuation lines. Anything richer (nested maps, lists) is ignored rather
 * than mis-parsed.
 */
export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();

    // gather the indented (or blank) lines that belong to this key
    const continuation: string[] = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
      continuation.push(lines[i + 1]);
      i++;
    }
    while (continuation.length && continuation[continuation.length - 1].trim() === "") continuation.pop();

    const block = /^([>|])([+-]?)\d*(?:\s+#.*)?$/.exec(value);
    if (block) {
      value = foldBlock(continuation, block[1] === ">");
    } else if (continuation.length && !continuation.some((l) => /^\s*-\s/.test(l))) {
      // plain multi-line scalar: lines join with single spaces
      value = [value, ...continuation.map((l) => l.trim())].filter(Boolean).join(" ");
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

function foldBlock(lines: string[], folded: boolean): string {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  const stripped = lines.map((l) => l.slice(indent).trimEnd());
  if (!folded) return stripped.join("\n").trim();
  // folded: single newlines become spaces, blank lines become paragraph breaks
  return stripped
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .join("\n")
    .trim();
}
