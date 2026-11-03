import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";

test("closing a project that is training asks first, stops the run and returns Home", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const runs = mkdtempSync(join(tmpdir(), "icarus-runs-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects, ICARUS_RUNS_DIR: runs });
  const engine = (path: string, method = "GET") =>
    page.evaluate(
      async ({ path, method }) => {
        const status = await window.icarus.engine.status();
        if (status.kind !== "ready") {
          throw new Error("The engine is not ready");
        }
        return (
          await fetch(`${status.url}${path}`, {
            method,
            headers: { "content-type": "application/json" },
            body: method === "POST" ? JSON.stringify({ total_steps: 200_000, copies: 2 }) : undefined,
          })
        ).json();
      },
      { path, method },
    );
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    const [project] = await engine("/projects");
    const run = await engine(`/projects/${project.id}/runs`, "POST");
    await expect.poll(async () => (await engine(`/runs/${run.run_id}`)).state, { timeout: 120_000 }).toBe("running");

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-goes-to="POP-PROJECT-MENU"]').first().click();
    await page.locator('[data-cta="close-project"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Run 1 is training")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join("test-results", "close-project.png") });

    await dialog.locator('[data-cta="stop-and-close"]').click();
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 60_000 });
    expect((await engine(`/runs/${run.run_id}`)).state).toBe("stopped");
    expect((await engine(`/projects/${project.id}/activity`)).running).toEqual([]);
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
    rmSync(runs, { recursive: true, force: true });
  }
});
