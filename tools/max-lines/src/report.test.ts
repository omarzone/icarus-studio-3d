import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findOversized } from "./report.ts";

it("skips local working files, not every folder named design", async () => {
  const root = mkdtempSync(join(tmpdir(), "max-lines-"));
  const big = "const x = 1;\n".repeat(301);
  for (const dir of [join(root, ".local", "mockups"), join(root, "services", "engine", "design")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "big.ts"), big);
  }
  const found = (await findOversized(root)).map((f) => f.path.replaceAll("\\", "/"));
  expect(found).toEqual(["services/engine/design/big.ts"]);
});
