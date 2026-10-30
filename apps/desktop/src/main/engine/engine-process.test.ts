import { expect, it, vi } from "vitest";
import { engineCommand, stopEngine } from "./engine-process.ts";

it("passes the repo path as one argument even with spaces", () => {
  expect(engineCommand("D:/Proyectos/Icarus Engine", 9100).args).toEqual([
    "run",
    "--project",
    "D:/Proyectos/Icarus Engine/services/engine",
    "icarus-engine",
    "--port",
    "9100",
  ]);
});

it("kills the whole process tree on Windows", () => {
  const run = vi.fn();
  stopEngine(4242, "win32", run);
  expect(run).toHaveBeenCalledWith("taskkill", ["/PID", "4242", "/T", "/F"]);
});
