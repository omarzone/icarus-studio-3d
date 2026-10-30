import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findRepoRoot(start: string, exists: (path: string) => boolean = existsSync): string | null {
  let dir = start;
  while (true) {
    if (exists(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
