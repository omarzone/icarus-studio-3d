import { expect, it } from "vitest";
import { waitForCallback } from "./loopback-callback.ts";

it("hands back the code the browser returns with and stops listening", async () => {
  const wait = await waitForCallback(0, 5_000);
  const other = await fetch(wait.url.replace("/auth/callback", "/favicon.ico"));
  const page = await fetch(`${wait.url}?code=one-time-code`);

  expect(other.status).toBe(404);
  expect(await page.text()).toContain("You are signed in");
  expect((await wait.done).get("code")).toBe("one-time-code");
  await expect(fetch(wait.url)).rejects.toThrow();
});

it("fails with the reason Supabase gives", async () => {
  const wait = await waitForCallback(0, 5_000);
  const failed = expect(wait.done).rejects.toThrow("access denied");
  await fetch(`${wait.url}?error=access_denied&error_description=access%20denied`);
  await failed;
});
