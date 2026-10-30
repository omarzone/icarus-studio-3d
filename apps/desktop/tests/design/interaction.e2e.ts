import { expect, type Locator, test } from "@playwright/test";
import { launchApp } from "./launch.ts";

const SCREENS = ["HDR-LAUNCHER", "HDR-WORKSPACE", "SYS-ENGINE-DOWN"];

const look = (control: Locator) =>
  control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.opacity, style.boxShadow, style.textDecorationLine].join(" | ");
  });

test("every control answers the pointer and every field takes typing", async () => {
  const { app, page } = await launchApp({ ICARUS_DESIGN_GALLERY: "1", ICARUS_ENGINE_URL: "http://127.0.0.1:9" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of SCREENS) {
    await page.evaluate((hash) => {
      location.hash = hash;
      location.reload();
    }, `#/__design/${id}`);
    await page.waitForSelector("[data-design-root]");
    const controls = page.locator("[data-cta]:not([aria-current]):not(:disabled)");
    await expect(controls.first(), `${id} has no controls`).toBeVisible();
    for (const control of await controls.all()) {
      await page.mouse.move(1, 899);
      const resting = await look(control);
      await control.hover();
      expect(await look(control), `${id}: "${await control.getAttribute("data-cta")}" has no hover state`).not.toBe(
        resting,
      );
    }
    for (const field of await page.locator("input").all()) {
      await field.click();
      expect(
        await field.evaluate((element) => getComputedStyle(element).outlineStyle),
        `${id}: field shows a ring`,
      ).toBe("none");
      await field.fill("");
      await field.pressSequentially("walker");
      await expect(field).toHaveValue("walker");
    }
  }
  await app.close();
});
