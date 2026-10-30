import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { expect, test } from "@playwright/test";
import { launchApp } from "./launch.ts";

type Status = { kind: string; url?: string };

function killListener(port: number): void {
  if (process.platform === "win32") {
    const lines = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).split(/\r?\n/);
    const pid = lines
      .find((l) => l.includes(`127.0.0.1:${port} `) && l.includes("LISTENING"))
      ?.trim()
      .split(/\s+/)
      .pop();
    if (pid) {
      execFileSync("taskkill", ["/PID", pid, "/T", "/F"]);
    }
    return;
  }
  execFileSync("fuser", ["-k", `${port}/tcp`]);
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => resolve(socket.destroy() === undefined));
    socket.once("error", () => resolve(false));
  });
}

const status = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    (window as unknown as { icarus: { engine: { status(): Promise<Status> } } }).icarus.engine.status(),
  );

test("the app recovers from an engine crash and leaves no engine behind", async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchApp({});
  const first = await test.step("engine becomes ready", async () => {
    await expect.poll(async () => (await status(page)).kind, { timeout: 120_000 }).toBe("ready");
    return Number(new URL((await status(page)).url ?? "").port);
  });
  await test.step("a crashed engine shows SYS-ENGINE-DOWN", async () => {
    killListener(first);
    await expect(page.locator('[data-ui-id="SYS-ENGINE-DOWN"]')).toBeVisible({ timeout: 30_000 });
  });
  const second = await test.step("restart brings the engine back", async () => {
    await page.locator('[data-cta="restart-engine"]').click();
    await expect.poll(async () => (await status(page)).kind, { timeout: 120_000 }).toBe("ready");
    await expect(page.locator('[data-ui-id="HDR-LAUNCHER"]')).toBeVisible();
    return Number(new URL((await status(page)).url ?? "").port);
  });
  await test.step("quitting leaves no engine behind", async () => {
    await app.close();
    await expect.poll(() => portOpen(second), { timeout: 15_000 }).toBe(false);
  });
});
