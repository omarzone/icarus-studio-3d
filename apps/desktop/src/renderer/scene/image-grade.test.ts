import { describe, expect, it } from "vitest";
import { imageGrade } from "./image-grade.ts";

const SKY = { top: "#5f8fc4", horizon: "#e4ecef", ambient: 1, fog: 0 };

describe("image grade", () => {
  it("leaves the picture untouched without a sky or with a neutral grade", () => {
    const neutral = { exposure: 1, filter: undefined, tint: null };
    expect(imageGrade(null)).toEqual(neutral);
    expect(imageGrade(SKY)).toEqual(neutral);
    expect(imageGrade({ ...SKY, tint: "#FFFFFF", brightness: 0 })).toEqual(neutral);
  });

  it("doubles the exposure per stop and caps it at three stops", () => {
    expect(imageGrade({ ...SKY, exposure: 1 }).exposure).toBe(2);
    expect(imageGrade({ ...SKY, exposure: -1 }).exposure).toBe(0.5);
    expect(imageGrade({ ...SKY, exposure: 9 }).exposure).toBe(8);
  });

  it("turns brightness, contrast and saturation into a CSS filter, -1 being none of it", () => {
    expect(imageGrade({ ...SKY, brightness: 0.2, contrast: -0.5, saturation: -1 }).filter).toBe(
      "brightness(1.2) contrast(0.5) saturate(0)",
    );
    expect(imageGrade({ ...SKY, saturation: 4 }).filter).toBe("saturate(2)");
  });

  it("multiplies by a tint only when it is a real color other than white", () => {
    expect(imageGrade({ ...SKY, tint: "#ffcc99" }).tint).toBe("#ffcc99");
    expect(imageGrade({ ...SKY, tint: "orange" }).tint).toBeNull();
  });
});
