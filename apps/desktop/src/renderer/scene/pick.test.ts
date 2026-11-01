import { expect, it } from "vitest";
import { isDeliberateClick } from "./pick.ts";

it("treats a press that barely moved as a click and a camera drag as not one", () => {
  expect(isDeliberateClick(0)).toBe(true);
  expect(isDeliberateClick(3)).toBe(true);
  expect(isDeliberateClick(40)).toBe(false);
});
