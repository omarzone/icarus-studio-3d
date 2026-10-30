import { tokens } from "@icarus/ui-tokens";
import { describe, expect, it } from "vitest";
import { isTitleBarHeight, resizeTitleBar, windowFrame } from "./window-frame.ts";

describe("windowFrame", () => {
  it("draws native caption buttons over the header on Windows, tinted to the app", () => {
    expect(windowFrame("win32", 56)).toEqual({
      titleBarStyle: "hidden",
      titleBarOverlay: { color: tokens.color.bg.app, symbolColor: tokens.color.fg.tool, height: 56 },
    });
  });

  it("keeps the real traffic lights on macOS, centered in the header", () => {
    expect(windowFrame("darwin", 52)).toEqual({ titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 19 } });
  });
});

describe("resizeTitleBar", () => {
  it("resizes the caption buttons on Windows and moves the traffic lights on macOS", () => {
    const calls: unknown[] = [];
    const win = {
      setTitleBarOverlay: (options: unknown) => calls.push(["overlay", options]),
      setWindowButtonPosition: (position: unknown) => calls.push(["lights", position]),
    };
    resizeTitleBar(win, "win32", 52);
    resizeTitleBar(win, "darwin", 56);
    expect(calls).toEqual([
      ["overlay", { height: 52 }],
      ["lights", { x: 18, y: 21 }],
    ]);
  });
});

it("accepts only plausible title bar heights from the renderer", () => {
  expect([52, 56].every(isTitleBarHeight)).toBe(true);
  expect([0, 52.5, 400, "52", null].some(isTitleBarHeight)).toBe(false);
});
