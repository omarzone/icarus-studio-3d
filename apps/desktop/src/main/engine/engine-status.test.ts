import { expect, it } from "vitest";
import { type EngineStatus, nextStatus } from "./engine-status.ts";

it("goes down with the last log lines when the engine exits", () => {
  const ready: EngineStatus = { kind: "ready", url: "http://127.0.0.1:9", version: "0.1.0" };
  expect(nextStatus(ready, { type: "exited", code: 3, lastLog: ["boom"] })).toEqual({
    kind: "down",
    reason: "The engine exited with code 3",
    lastLog: ["boom"],
  });
  expect(nextStatus({ kind: "down", reason: "x", lastLog: [] }, { type: "restart" })).toEqual({ kind: "starting" });
});

it("goes down with the given reason when the engine cannot run", () => {
  expect(nextStatus({ kind: "starting" }, { type: "failed", reason: "uv was not found on PATH", lastLog: [] })).toEqual(
    {
      kind: "down",
      reason: "uv was not found on PATH",
      lastLog: [],
    },
  );
});

it("goes down with a reason when the engine never becomes healthy", () => {
  expect(nextStatus({ kind: "starting" }, { type: "timeout", lastLog: ["uv: not found"] })).toEqual({
    kind: "down",
    reason: "The engine did not start in time",
    lastLog: ["uv: not found"],
  });
});
