import { expect, it } from "vitest";
import { moduleRegions } from "./regions.ts";

it("maps a tab strip to its module and keeps the panel box", () => {
  const panels = [{ tabs: ["Explorer"], box: { x: 12, y: 52, w: 258, h: 380 } }];
  expect(moduleRegions(panels)).toEqual({ "PNL-EXPLORER": { x: 12, y: 52, w: 258, h: 380 } });
});

it("ignores strips that are not in the module map", () => {
  expect(moduleRegions([{ tabs: ["Unknown"], box: { x: 0, y: 0, w: 1, h: 1 } }])).toEqual({});
});
