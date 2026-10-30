import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { type Box, compareImages } from "./compare.ts";
import implemented from "./implemented.json" with { type: "json" };
import { launchApp } from "./launch.ts";
import { type ParityResult, writeReport } from "./report.ts";

const designDir = join(import.meta.dirname, "..", "..", "..", "..", "docs", "design");
const regions: Record<string, { modules: Record<string, Box>; masks: Box[] }> = JSON.parse(
  readFileSync(join(designDir, "reference", "regions.json"), "utf8"),
);

test("every implemented catalog ID matches its design", async () => {
  const { app, page } = await launchApp({ ICARUS_DESIGN_GALLERY: "1", ICARUS_ENGINE_URL: "http://127.0.0.1:9" });
  const results: ParityResult[] = [];
  for (const { id, maxDiff } of implemented) {
    await page.evaluate((hash) => {
      location.hash = hash;
      location.reload();
    }, `#/__design/${id}`);
    await page.waitForSelector("[data-design-root]");
    await page.evaluate(() => document.fonts.ready);
    const actual = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } }));
    const reference = PNG.sync.read(readFileSync(join(designDir, "reference", `${id}.png`)));
    const { ratio, diff } = compareImages(reference, actual, regions[id]?.masks ?? []);
    results.push({ id, ratio, maxDiff, reference, actual, diff });
  }
  writeReport(results, join(import.meta.dirname, "..", "..", "test-results", "design"));
  await app.close();
  for (const result of results) {
    expect(result.ratio, `${result.id} differs from the design`).toBeLessThanOrEqual(result.maxDiff);
  }
});
