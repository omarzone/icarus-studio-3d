import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { countCodeLines, type Language } from "./count-code-lines.ts";

export type Oversized = { path: string; lines: number; limit: number };

const SKIP_DIRS = new Set(["node_modules", ".venv", "dist", "out", ".git", ".superpowers", "design", "test-results"]);
const SKIP_FILES = new Set(["generated.ts"]);

function limitFor(name: string): { limit: number; language: Language } | null {
  const isTest = /\.test\.tsx?$/.test(name) || /\.e2e\.ts$/.test(name) || /^test_.*\.py$/.test(name);
  if (name.endsWith(".py")) {
    return { limit: isTest ? 800 : 400, language: "py" };
  }
  if (name.endsWith(".tsx")) {
    return { limit: isTest ? 800 : 400, language: "ts" };
  }
  if (name.endsWith(".ts")) {
    return { limit: isTest ? 800 : 300, language: "ts" };
  }
  return null;
}

export async function findOversized(root: string): Promise<Oversized[]> {
  const found: Oversized[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
        continue;
      }
      const rule = SKIP_FILES.has(entry.name) ? null : limitFor(entry.name);
      if (!rule) {
        continue;
      }
      const path = join(dir, entry.name);
      const lines = countCodeLines(await readFile(path, "utf8"), rule.language);
      if (lines > rule.limit) {
        found.push({ path: relative(root, path), lines, limit: rule.limit });
      }
    }
  }
  await walk(root);
  return found;
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..", "..");
  for (const file of await findOversized(root)) {
    console.log(`WARN ${file.path} ${file.lines}/${file.limit}`);
  }
}
