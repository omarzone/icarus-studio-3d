import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import implemented from "./implemented.json" with { type: "json" };
import { launchApp } from "./launch.ts";

type Anchor = { label: string; goesTo: string | null; kind: string };
const inventory: Record<string, { anchors: Anchor[] }> = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "docs", "design", "inventory.json"), "utf8"),
);

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

test("every control in the catalog exists and leads where the design says", async () => {
  const { app, page } = await launchApp({ ICARUS_DESIGN_GALLERY: "1", ICARUS_ENGINE_URL: "http://127.0.0.1:9" });
  for (const { id } of implemented) {
    await page.evaluate((hash) => {
      location.hash = hash;
      location.reload();
    }, `#/__design/${id}`);
    await page.waitForSelector("[data-design-root]");
    for (const anchor of inventory[id]?.anchors ?? []) {
      const control = page.locator(`[data-cta="${slug(anchor.label)}"]`).first();
      await expect(control, `${id}: missing "${anchor.label}"`).toHaveCount(1);
      if (anchor.goesTo) {
        await expect(control, `${id}: "${anchor.label}" destination`).toHaveAttribute("data-goes-to", anchor.goesTo);
      }
    }
  }
  await app.close();
});
