import { expect, test } from "@playwright/test";
import { galleryCatalog, launchGallery, openRoute, reachable } from "./launch.ts";

// Clicks every control that leads somewhere and checks the app really goes there.
test("every control leads where it says", async () => {
  test.setTimeout(900_000);
  const { app, page } = await launchGallery();
  const { routes } = await galleryCatalog(page);
  const wrong: string[] = [];
  for (const { id } of routes) {
    await openRoute(page, id);
    const targets = await page.locator(`${reachable(id)}button[data-goes-to]:not(:disabled)`).evaluateAll((elements) =>
      elements.map((element) => ({
        cta: element.getAttribute("data-cta") ?? "",
        to: element.getAttribute("data-goes-to") ?? "",
      })),
    );
    const unique = [...new Map(targets.map((target) => [`${target.cta}→${target.to}`, target])).values()];
    for (const { cta, to } of unique) {
      await openRoute(page, id);
      await page
        .locator(`${reachable(id)}[data-cta="${cta}"][data-goes-to="${to}"]`)
        .first()
        .click();
      const landed = await page
        .locator("[data-route-screen]")
        .first()
        .evaluate((root) => root.getAttribute("data-route-overlay") || root.getAttribute("data-route-screen"));
      if (landed !== to) {
        wrong.push(`${id}: "${cta}" went to ${landed} instead of ${to}`);
      }
    }
  }
  await app.close();
  expect(wrong).toEqual([]);
});
