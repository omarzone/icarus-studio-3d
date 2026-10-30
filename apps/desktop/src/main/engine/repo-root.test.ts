import { join } from "node:path";
import { expect, it } from "vitest";
import { findRepoRoot } from "./repo-root.ts";

it("walks up from the built main script to the workspace root", () => {
  const root = join("D:", "Proyectos", "Icarus Engine");
  const exists = (path: string) => path === join(root, "pnpm-workspace.yaml");
  expect(findRepoRoot(join(root, "apps", "desktop", "out", "main"), exists)).toBe(root);
});

it("returns null outside a workspace", () => {
  expect(findRepoRoot(join("D:", "elsewhere"), () => false)).toBeNull();
});
