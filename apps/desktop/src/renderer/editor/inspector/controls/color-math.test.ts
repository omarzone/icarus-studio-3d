import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, parseHex } from "./color-math.ts";

describe("color math", () => {
  it("reads primaries and greys as hue, saturation and value", () => {
    expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00FF00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv("#0000FF")).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexToHsv("#808080")).toEqual({ h: 0, s: 0, v: 128 / 255 });
  });

  it("writes uppercase #RRGGBB and wraps hue 360 back to red", () => {
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe("#FFFF00");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#FF0000");
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe("#FFFFFF");
  });

  it("round-trips any hex through hsv unchanged", () => {
    for (const hex of ["#3A7BD5", "#00D1B2", "#123456", "#FEDCBA", "#010101", "#7F7F80"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("accepts typed hex with or without # and short forms, rejecting the rest", () => {
    expect(parseHex(" 3a7bd5 ")).toBe("#3A7BD5");
    expect(parseHex("#abc")).toBe("#AABBCC");
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("red")).toBeNull();
  });
});
