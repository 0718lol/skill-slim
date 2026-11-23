#!/usr/bin/env node
/**
 * Zero-dependency build: src/**\/*.ts → dist/**\/*.js.
 *
 * Node refuses to strip types for files under node_modules, so the published
 * package must ship plain JavaScript. The sources only use erasable TypeScript
 * (they already run under Node's type stripping), so Node's own
 * module.stripTypeScriptTypes is all the compiler we need; relative ".ts"
 * import specifiers are rewritten to ".js".
 */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

// stripTypeScriptTypes prints an ExperimentalWarning; it is expected here
process.removeAllListeners("warning");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const outDir = path.join(root, "dist");

/** `from "./x.ts"`, `import "./x.ts"`, `import("./x.ts")` → .js (relative specifiers only) */
const RELATIVE_TS_IMPORT = /((?:\bfrom|\bimport)\s*\(?\s*)(["'])(\.{1,2}\/[^"'\n]+?)\.ts\2/g;

export function rewriteImports(code) {
  return code.replace(RELATIVE_TS_IMPORT, (_, lead, quote, spec) => `${lead}${quote}${spec}.js${quote}`);
}

async function* walk(dir) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) yield full;
  }
}

async function build() {
  await fsp.rm(outDir, { recursive: true, force: true });
  let count = 0;
  for await (const file of walk(srcDir)) {
    const source = await fsp.readFile(file, "utf8");
    const js = rewriteImports(stripTypeScriptTypes(source, { mode: "strip" }));
    const dest = path.join(outDir, path.relative(srcDir, file)).replace(/\.ts$/, ".js");
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, js);
    if (js.startsWith("#!")) await fsp.chmod(dest, 0o755);
    count++;
  }
  console.log(`built ${count} file(s) → ${path.relative(root, outDir)}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
