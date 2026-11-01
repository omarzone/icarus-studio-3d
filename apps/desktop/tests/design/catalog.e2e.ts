import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { galleryCatalog, launchGallery, openRoute } from "./launch.ts";

type Anchor = { label: string; goesTo: string | null; kind: string };
const inventory: Record<string, { anchors: Anchor[] }> = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "docs", "design", "inventory.json"), "utf8"),
);

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

test("every control in the design exists and declares where it leads", async () => {
  test.setTimeout(900_000);
  const { app, page } = await launchGallery();
  const { routes } = await galleryCatalog(page);
  const missing: string[] = [];
  for (const { id } of routes) {
    await openRoute(page, id);
    for (const anchor of inventory[id]?.anchors ?? []) {
      const selector = anchor.goesTo
        ? `[data-cta="${slug(anchor.label)}"][data-goes-to="${anchor.goesTo}"]`
        : `[data-cta="${slug(anchor.label)}"]`;
      if ((await page.locator(selector).count()) === 0) {
        missing.push(`${id}: "${anchor.label.replaceAll("\n", " ")}" → ${anchor.goesTo ?? "acts in place"}`);
      }
    }
  }
  await app.close();
  expect(missing).toEqual([]);
});
