import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { geminiCliAdapter } from "../src/adapters/gemini-cli.ts";
import { ANTIGRAVITY_SKILL_CALL_RE, antigravityAdapter } from "../src/adapters/antigravity.ts";
import { SKILL_PATH_RE } from "../src/util/sqlite-scan.ts";
import { runChecks } from "../src/core/checks.ts";

// fixtures carry only a handful of conversations; the gate has its own tests
process.env.SKILL_SLIM_MIN_CONVERSATIONS ??= "0";

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeSkill(root: string, name: string, description: string): void {
  write(path.join(root, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nBody for ${name}.\n`);
}

const enc = (s: string) => new TextEncoder().encode(s);
const catalog = (home: string, names: string[]) =>
  names.map((n) => `- ${n} (${home}/.gemini/config/skills/${n}/SKILL.md): does ${n}`).join("\n");
const viewCall = (p: string) => `call_1\u0012\tview_file\u001a{"AbsolutePath":"${p}","EndLine":40,"StartLine":1}`;

/** Antigravity conversation DB: system prompt (catalog) in gen_metadata, tool calls in steps. */
function makeConversationDb(home: string, name: string, steps: string[], prompt = ""): void {
  const dir = path.join(home, ".gemini", "antigravity", "conversations");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, name));
  db.exec("CREATE TABLE trajectory_meta (trajectory_id TEXT)");
  db.exec("CREATE TABLE steps (step_payload BLOB, metadata BLOB)");
  db.exec("CREATE TABLE gen_metadata (data BLOB)");
  db.prepare("INSERT INTO trajectory_meta (trajectory_id) VALUES (?)").run("t1");
  db.prepare("INSERT INTO trajectory_meta (trajectory_id) VALUES (?)").run("t2");
  for (const p of steps) db.prepare("INSERT INTO steps (step_payload) VALUES (?)").run(enc(p));
  if (prompt) db.prepare("INSERT INTO gen_metadata (data) VALUES (?)").run(enc(prompt));
  db.close();
}

function antigravityHome(prefix: string): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(home, ".gemini", "antigravity"), { recursive: true });
  return home;
}

test("antigravity counts only real skill reads, never the prompt's skill catalog", async () => {
  const home = antigravityHome("sd-agy-");
  const skills = path.join(home, ".gemini", "config", "skills");
  writeSkill(skills, "alpha", "Antigravity test skill alpha");
  writeSkill(skills, "beta", "Antigravity test skill beta");
  writeSkill(skills, "ghost", "Antigravity test skill ghost");
  // flat plugin skill directly at <plugin>/skills/SKILL.md
  const config = path.join(home, ".gemini", "config");
  write(path.join(config, "config.json"), JSON.stringify({ plugins: { "flat-plug": {} } }));
  write(
    path.join(config, "plugins", "flat-plug", "skills", "SKILL.md"),
    "---\nname: flat-cli\ndescription: Flat plugin root skill\n---\nBody.\n",
  );
  makeConversationDb(
    home,
    "conv.db",
    [
      viewCall(`${skills}/alpha/SKILL.md`),
      // keys before Path (alphabetical serialization when EndLine/StartLine are set)
      `read_file {"EndLine":40,"Path":"${skills}/beta/SKILL.md","StartLine":1}`,
      // flat plugin skill read resolves to its frontmatter name
      `read_file {"Path":"${config}/plugins/flat-plug/skills/SKILL.md"}`,
      // cross-agent read (e.g. inspecting a Codex plugin) must not count as Antigravity usage
      `read_file {"Path":"${home}/.codex/plugins/cache/mkt/other/0.1.0/skills/codex-only/SKILL.md"}`,
      `find output\n${skills}/ghost/SKILL.md\n`, // a listing is not a load
      `write_to_file {"Overwrite":true,"Path":"${skills}/ghost/SKILL.md"}`, // nor is editing it
    ],
    catalog(home, ["alpha", "beta", "ghost"]),
  );

  const scan = await antigravityAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name).sort(), ["alpha", "beta", "flat-cli", "ghost"]);
  assert.equal(scan.usageAvailable, true);
  assert.equal(scan.conversationCount, 2);
  assert.equal(scan.usage.get("alpha")?.count, 1);
  assert.equal(scan.usage.get("beta")?.count, 1);
  assert.equal(scan.usage.get("flat-cli")?.count, 1);
  assert.ok(!scan.usage.has("codex-only"), "other agents' SKILL.md reads must not pollute Antigravity usage");
  assert.ok(!scan.usage.has("ghost"), "catalog / find / write mentions must not count as use");

  const unused = runChecks(scan, 30).findings.filter((f) => f.kind === "unused");
  assert.deepEqual(unused.map((f) => f.title.split('"')[1]), ["ghost"]);
  fs.rmSync(home, { recursive: true, force: true });
});

test("antigravity and the shared path proxy understand Windows paths", async () => {
  const winPath = String.raw`C:\\Users\\me\\.gemini\\config\\skills\\alpha\\SKILL.md`; // JSON-escaped
  const hits = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(hits(ANTIGRAVITY_SKILL_CALL_RE, viewCall(winPath)), ["alpha"]);
  assert.deepEqual(hits(ANTIGRAVITY_SKILL_CALL_RE, viewCall(String.raw`C:\Users\me\skills\beta\SKILL.md`)), ["beta"]);
  assert.deepEqual(
    hits(ANTIGRAVITY_SKILL_CALL_RE, String.raw`read_file {"EndLine":20,"Path":"C:\\Users\\me\\.gemini\\config\\plugins\\android-cli-plugin\\skills\\SKILL.md"}`),
    ["android-cli-plugin"],
  );
  assert.deepEqual(hits(SKILL_PATH_RE, `type ${winPath} and cat ~/.agents/skills/gamma/SKILL.md`), ["alpha", "gamma"]);
});

test("antigravity abstains when the catalog is the only SKILL.md trace", async () => {
  const home = antigravityHome("sd-agy2-");
  writeSkill(path.join(home, ".gemini", "config", "skills"), "alpha", "Antigravity test skill alpha");
  makeConversationDb(home, "conv.db", ["plain assistant text"], catalog(home, ["alpha"]));

  const scan = await antigravityAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.usageAvailable, false, "no real skill read must mean unknown, not unused");
  assert.equal(scan.conversationCount, 2);
  assert.equal(runChecks(scan, 30).findings.filter((f) => f.kind === "unused").length, 0);
  fs.rmSync(home, { recursive: true, force: true });
});

test("antigravity loads installed plugins and always-on rules; notes builtin skills and deduped on-demand rules", async () => {
  const home = antigravityHome("sd-agy3-");
  const config = path.join(home, ".gemini", "config");
  write(path.join(config, "config.json"), JSON.stringify({ plugins: { kept: {}, off: { enabled: false } } }));
  writeSkill(path.join(config, "plugins", "kept", "skills"), "kept-skill", "from an installed plugin");
  writeSkill(path.join(config, "plugins", "off", "skills"), "off-skill", "from a disabled plugin");
  writeSkill(path.join(config, "plugins", "stray", "skills"), "stray-skill", "folder not in config.json");
  writeSkill(path.join(home, ".gemini", "antigravity", "builtin", "skills"), "builtin-skill", "ships with the app");
  write(path.join(config, "rules", "always.md"), "---\ntrigger: always_on\n---\nAlways do X.\n");
  write(path.join(config, "rules", "lazy.md"), "---\ntrigger: model_decision\n---\nSometimes do Y.\n");
  // standalone markdown rule without frontmatter (like science/rules/AGENTS.md) is always active
  write(path.join(config, "plugins", "kept", "rules", "AGENTS.md"), "# Always active plugin rule\nDo Z.\n");
  // .md + .mdc pair for the same always-on rule → loaded once
  write(path.join(config, "plugins", "kept", "rules", "r.md"), "---\ntrigger: always_on\n---\nPlugin rule.\n");
  write(path.join(config, "plugins", "kept", "rules", "r.mdc"), "---\nalwaysApply: true\n---\nPlugin rule.\n");
  // .md + .mdc pair for the same on-demand rule → counted once in onDemand
  write(path.join(config, "plugins", "kept", "rules", "glob-rule.md"), "---\ntrigger: glob\nglobs: \"**/*.ts\"\n---\nTS rule.\n");
  write(path.join(config, "plugins", "kept", "rules", "glob-rule.mdc"), "---\nglobs: \"**/*.ts\"\nalwaysApply: false\n---\nTS rule.\n");

  const scan = await antigravityAdapter.scan({ home, cwd: home, windowDays: 30 });
  const byName = new Map(scan.skills.map((s) => [s.name, s.source]));
  assert.deepEqual([...byName.keys()].sort(), ["kept-skill"]);
  assert.equal(byName.get("kept-skill"), "plugin");
  assert.deepEqual(
    scan.instructions.map((i) => i.label).sort(),
    ["plugin kept rule AGENTS.md", "plugin kept rule r.md", "rule always.md"],
  );
  assert.ok(scan.notes.some((n) => n.includes("skipped 2 plugin folder(s)")));
  assert.ok(scan.notes.some((n) => n.startsWith("1 app-builtin skill(s) not billed")));
  assert.ok(scan.notes.some((n) => n.startsWith("2 on-demand rule(s)")), scan.notes.join("; "));
  fs.rmSync(home, { recursive: true, force: true });
});

test("an Antigravity-only ~/.gemini does not count as Gemini CLI", async () => {
  const home = antigravityHome("sd-agy4-");
  writeSkill(path.join(home, ".gemini", "config", "skills"), "alpha", "Antigravity skill");
  assert.equal(await geminiCliAdapter.detect({ home }), false);
  assert.equal((await geminiCliAdapter.scan({ home, cwd: home, windowDays: 30 })).detected, false);
  assert.equal(await antigravityAdapter.detect({ home }), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("gemini cli finds skills, GEMINI.md and extensions but never claims usage", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-gemini-"));
  write(path.join(home, ".gemini", "settings.json"), "{}");
  writeSkill(path.join(home, ".gemini", "skills"), "alpha", "Gemini test skill alpha");
  write(path.join(home, ".gemini", "GEMINI.md"), "Be terse.\n");
  write(path.join(home, ".gemini", "extensions", "ext1", "GEMINI.md"), "Extension context.\n");

  const scan = await geminiCliAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name), ["alpha"]);
  assert.equal(scan.instructions.length, 2);
  assert.equal(scan.usageAvailable, false);
  assert.equal(runChecks(scan, 30).findings.filter((f) => f.kind === "unused").length, 0);
  fs.rmSync(home, { recursive: true, force: true });
});

test("gemini adapter reports not-detected for empty home", async () => {
  const scan = await geminiCliAdapter.scan({ home: "/nonexistent-home-xyz", cwd: "/tmp", windowDays: 30 });
  assert.equal(scan.detected, false);
  assert.equal(scan.skills.length, 0);
  assert.equal((await antigravityAdapter.scan({ home: "/nonexistent-home-xyz", cwd: "/tmp", windowDays: 30 })).detected, false);
});
