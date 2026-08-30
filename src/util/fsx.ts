import { promises as fsp } from "node:fs";
import * as path from "node:path";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function exists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function readFileSafe(p: string): Promise<string | null> {
  try {
    const stat = await fsp.stat(p);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return await fsp.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Depth-limited BFS for directories with a given basename, e.g. every
 * `skills/` folder inside a plugin cache. Caps the walk so huge trees
 * (marketplace caches) can't stall the scan.
 */
export async function findNamedDirs(root: string, name: string, maxDepth = 4, maxHits = 200): Promise<string[]> {
  const hits: string[] = [];
  let frontier = [root];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && hits.length < maxHits; depth++) {
    const next: string[] = [];
    for (const dir of frontier) {
      for (const child of await listDirs(dir)) {
        if (path.basename(child) === name) {
          hits.push(child);
          if (hits.length >= maxHits) return hits;
        } else {
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return hits;
}

export async function mtimes(p: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    p.map(async (f) => {
      try {
        out.set(f, (await fsp.stat(f)).mtimeMs);
      } catch {
        /* file vanished mid-scan */
      }
    }),
  );
  return out;
}

/**
 * Depth-limited recursive file listing by extension, e.g. every `.jsonl`
 * under a `sessions/<year>/<month>/<day>/` tree.
 */
export async function findFilesDeep(root: string, ext: string, maxDepth = 6, maxFiles = 5000): Promise<string[]> {
  const out: string[] = [];
  let frontier = [root];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && out.length < maxFiles; depth++) {
    const next: string[] = [];
    for (const dir of frontier) {
      for (const file of await listFiles(dir, ext)) {
        out.push(file);
        if (out.length >= maxFiles) return out;
      }
      next.push(...(await listDirs(dir)));
    }
    frontier = next;
  }
  return out;
}

/** Move a directory into the quarantine root. Falls back to copy+delete across devices. */
export async function quarantineMove(srcDir: string, destDir: string): Promise<void> {
  await fsp.mkdir(path.dirname(destDir), { recursive: true });
  try {
    await fsp.rename(srcDir, destDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fsp.cp(srcDir, destDir, { recursive: true });
    await fsp.rm(srcDir, { recursive: true, force: true });
  }
}
