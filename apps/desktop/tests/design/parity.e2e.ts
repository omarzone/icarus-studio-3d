import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { type Box, compareImages } from "./compare.ts";
import { galleryCatalog, launchGallery, openGallery } from "./launch.ts";
import { type ParityResult, writeReport } from "./report.ts";

const designDir = join(import.meta.dirname, "..", "..", "..", "..", "docs", "design");
const regions: Record<string, { modules: Record<string, Box>; masks: Box[] }> = JSON.parse(
  readFileSync(join(designDir, "reference", "regions.json"), "utf8"),
);

test("every built catalog ID matches its design", async () => {
  test.setTimeout(900_000);
  const { app, page } = await launchGallery();
  const { routes } = await galleryCatalog(page);
  const results: ParityResult[] = [];
  for (const { id, maxDiff } of routes) {
    await openGallery(page, id);
    const actual = PNG.sync.read(
      await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 }, scale: "css" }),
    );
    expect([actual.width, actual.height], `${id} capture size`).toEqual([1440, 900]);
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
