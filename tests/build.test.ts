import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
// @ts-ignore — plain .mjs build script without type declarations
import { rewriteImports } from "../scripts/build.mjs";
import { VERSION } from "../src/version.ts";
import { browserCommand } from "../src/server.ts";

test("browser opener passes an empty window title to Windows start", () => {
  const url = "http://127.0.0.1:7466";
  assert.deepEqual(browserCommand(url, "win32"), ["cmd", ["/c", "start", "", url]]);
  assert.deepEqual(browserCommand(url, "darwin"), ["open", [url]]);
  assert.deepEqual(browserCommand(url, "linux"), ["xdg-open", [url]]);
});

test("shipped SKILL.md is the newest evaluated prompt", () => {
  const dir = new URL("../evals/prompts/", import.meta.url);
  const newest = readdirSync(dir)
    .map((f) => /^skill-v(\d+)\.md$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  assert.ok(newest, "no evals/prompts/skill-vN.md found");
  const shipped = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
  assert.equal(shipped, readFileSync(new URL(newest[0], dir), "utf8"), `SKILL.md differs from ${newest[0]}`);
  assert.match(shipped, new RegExp(`version: ${VERSION.replace(/\./g, "\\.")}`), "SKILL.md metadata version");
});

test("build rewrites relative .ts specifiers and nothing else", () => {
  const src = [
    'import "./util/quiet-warnings.ts";',
    'import { a } from "./a.ts";',
    "import type { B } from '../types.ts';",
    'export { c } from "./c.ts";',
    'const m = await import("./lazy.ts");',
    'import * as path from "node:path";',
    'const name = "SKILL.md"; const f = "notes.ts";',
  ].join("\n");
  const out = rewriteImports(src);
  assert.match(out, /import "\.\/util\/quiet-warnings\.js";/);
  assert.match(out, /from "\.\/a\.js"/);
  assert.match(out, /from '\.\.\/types\.js'/);
  assert.match(out, /from "\.\/c\.js"/);
  assert.match(out, /import\("\.\/lazy\.js"\)/);
  assert.match(out, /"node:path"/);
  assert.match(out, /const f = "notes\.ts"/, "plain strings that are not import specifiers stay untouched");
});

test("package.json bin points at built JavaScript and versions agree", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.bin["skill-slim"], "dist/cli.js");
  assert.ok(pkg.files.includes("dist") && !pkg.files.includes("src"));
  assert.equal(pkg.version, VERSION);
});
