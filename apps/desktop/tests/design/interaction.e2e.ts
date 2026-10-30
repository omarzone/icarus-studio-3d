import { expect, type Locator, type Page, test } from "@playwright/test";
import { galleryCatalog, launchGallery, openGallery, openRoute, reachable } from "./launch.ts";

const look = (control: Locator) =>
  control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.opacity, style.boxShadow, style.textDecorationLine].join(" | ");
  });

async function checkControls(page: Page, id: string, scope: string, problems: string[]): Promise<void> {
  const controls = page.locator(`${scope}[data-cta]:not([aria-current]):not([aria-selected="true"]):not(:disabled)`);
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) {
      continue;
    }
    await page.mouse.move(1, 899);
    const resting = await look(control);
    // The hidden window paints few frames, so waiting for a stable element takes seconds per control.
    await control.hover({ force: true });
    if ((await look(control)) === resting) {
      problems.push(`${id}: "${await control.getAttribute("data-cta")}" has no hover state`);
    }
  }
  for (const field of await page
    .locator(`${scope}input:not([type="checkbox"]):not([type="radio"]):not(:disabled)`)
    .all()) {
    if (!(await field.isVisible())) {
      continue;
    }
    await field.click();
    if ((await field.evaluate((element) => getComputedStyle(element).outlineStyle)) !== "none") {
      problems.push(`${id}: field shows a ring when clicked`);
    }
    await field.fill("");
    await field.pressSequentially("walker");
    if ((await field.inputValue()) !== "walker") {
      problems.push(`${id}: field does not take typing`);
    }
    await page.keyboard.press("Escape");
  }
}

test("every control answers the pointer and every field takes typing", async () => {
  test.setTimeout(1_800_000);
  const { app, page } = await launchGallery();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { routes, modules } = await galleryCatalog(page);
  const problems: string[] = [];
  for (const id of modules) {
    await openGallery(page, id);
    await checkControls(page, id, "", problems);
  }
  await openGallery(page, "SYS-ENGINE-DOWN");
  for (const { id } of routes) {
    await openRoute(page, id);
    await checkControls(page, id, reachable(id), problems);
  }
  await app.close();
  expect(problems).toEqual([]);
});
