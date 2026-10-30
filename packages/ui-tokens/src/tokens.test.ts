import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { tokens } from "./tokens.ts";

function lookup(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (typeof node !== "object" || node === null || !(key in node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === "object" && node !== null && "DEFAULT" in node) {
    return (node as Record<string, unknown>).DEFAULT;
  }
  return node;
}

it("matches every dark color in docs/design/tokens.md", () => {
  const doc = readFileSync(new URL("../../../docs/design/tokens.md", import.meta.url), "utf8");
  const rows = [...doc.matchAll(/^\| `(color\.[a-z.-]+)` \| `([^`]+)` /gm)];
  expect(rows.length).toBeGreaterThan(20);
  for (const [, path, value] of rows) {
    expect(lookup(tokens, path ?? ""), path).toBe(value);
  }
});
