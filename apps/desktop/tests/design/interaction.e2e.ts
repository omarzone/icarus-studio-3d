import { expect, type Locator, type Page, test } from "@playwright/test";
import { galleryCatalog, launchGallery, openGallery, openRoute, reachable } from "./launch.ts";

const look = (control: Locator) =>
  control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.opacity, style.boxShadow, style.textDecorationLine].join(" | ");
  });

// Center of a control a person can see, scrolled into view; null when it is hidden.
const pointAt = (control: Locator) =>
  control.evaluate((element) => {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const box = element.getBoundingClientRect();
    const hidden = box.width === 0 || box.height === 0 || getComputedStyle(element).visibility === "hidden";
    return hidden ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });

async function checkControls(page: Page, id: string, scope: string, problems: string[]): Promise<void> {
  const controls = page.locator(`${scope}[data-cta]:not([aria-current]):not([aria-selected="true"]):not(:disabled)`);
  for (const control of await controls.all()) {
    const point = await pointAt(control);
    if (!point) {
      continue;
    }
    await page.mouse.move(1, 899);
    const resting = await look(control);
    // Moving the pointer directly skips actionability waits, which take seconds per control in the hidden window.
    await page.mouse.move(point.x, point.y);
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

test("every module control answers the pointer and every field takes typing", async () => {
  test.setTimeout(1_800_000);
  const { app, page } = await launchGallery();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { modules } = await galleryCatalog(page);
  const problems: string[] = [];
  for (const id of modules) {
    await openGallery(page, id);
    await checkControls(page, id, "", problems);
  }
  await app.close();
  expect(problems).toEqual([]);
});

// Screens run in chunks so each fits its time limit; the catalog only grows.
const SCREEN_CHUNKS = 4;

for (let chunk = 0; chunk < SCREEN_CHUNKS; chunk += 1) {
  test(`every screen control answers the pointer and every field takes typing (part ${chunk + 1})`, async () => {
    test.setTimeout(1_800_000);
    const { app, page } = await launchGallery();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { routes } = await galleryCatalog(page);
    const problems: string[] = [];
    for (const [index, { id }] of routes.entries()) {
      if (index % SCREEN_CHUNKS !== chunk) {
        continue;
      }
      await openRoute(page, id);
      await checkControls(page, id, reachable(id), problems);
    }
    await app.close();
    expect(problems).toEqual([]);
  });
}
