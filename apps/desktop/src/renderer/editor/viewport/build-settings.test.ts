import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD_SETTINGS, readBuildSettings } from "./build-settings.ts";

describe("build settings remembered on this computer", () => {
  it("reads back what was saved", () => {
    const saved = { move: 0.25, rotate: 90, grid: "off", cell: 2, placeOnClick: true };
    expect(readBuildSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it("keeps a free snap as saved", () => {
    expect(readBuildSettings(JSON.stringify({ move: null, rotate: null }))).toMatchObject({ move: null, rotate: null });
  });

  it("falls back to the defaults for missing, broken or values the menus do not offer", () => {
    expect(readBuildSettings(null)).toEqual(DEFAULT_BUILD_SETTINGS);
    expect(readBuildSettings("{not json")).toEqual(DEFAULT_BUILD_SETTINGS);
    expect(readBuildSettings(JSON.stringify({ move: 0.3, rotate: "45", grid: "maybe", cell: -1 }))).toEqual(
      DEFAULT_BUILD_SETTINGS,
    );
  });
});
