import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { catalog } from "../navigation/route-registry.ts";
import { pendingActions } from "./pending.ts";
import { pendingReport } from "./pending-report.ts";

import.meta.glob(["../../**/*-port.ts"], { eager: true });

const desktopDir = join(import.meta.dirname, "..", "..", "..", "..");
const reportPath = join(desktopDir, "PENDING.md");
const inventory: Record<string, unknown> = JSON.parse(
  readFileSync(join(desktopDir, "..", "..", "docs", "design", "inventory.json"), "utf8"),
);

it("keeps PENDING.md in step with the ports and the catalog", () => {
  const built = new Set<string>(catalog.routes.keys());
  const unbuilt = Object.keys(inventory)
    .filter((id) => !built.has(id))
    .sort();
  const report = pendingReport(pendingActions(), unbuilt);
  if (process.env.UPDATE_PENDING === "1") {
    writeFileSync(reportPath, report);
  }
  expect(readFileSync(reportPath, "utf8"), "PENDING.md is stale: run pnpm -F desktop gen:pending").toBe(report);
});

it("registers only catalog IDs from the design inventory", () => {
  const known = new Set(Object.keys(inventory));
  const unknown = [...catalog.routes.keys()].filter((id) => !known.has(id));
  expect(unknown).toEqual([]);
});

it("declares every pending action for a known catalog ID", () => {
  const known = new Set([...Object.keys(inventory), ...catalog.modules.keys()]);
  const stray = pendingActions().flatMap((action) => action.ids.filter((id) => !known.has(id)));
  expect(stray).toEqual([]);
});
