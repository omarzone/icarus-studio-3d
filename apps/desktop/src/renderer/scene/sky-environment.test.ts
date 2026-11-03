import { describe, expect, it } from "vitest";
import { ENVIRONMENT_HEIGHT, ENVIRONMENT_WIDTH, environmentPixels, needsEnvironment } from "./sky-environment.ts";

const pixel = (pixels: Uint8Array, row: number) =>
  Array.from(pixels.slice(row * ENVIRONMENT_WIDTH * 4, row * ENVIRONMENT_WIDTH * 4 + 3));

describe("sky environment", () => {
  it("shows the ground below the horizon and the sky above it, nearly the top color straight up", () => {
    const pixels = environmentPixels("#0000ff", "#ffffff", "#00ff00");
    expect(pixels).toHaveLength(ENVIRONMENT_WIDTH * ENVIRONMENT_HEIGHT * 4);
    expect(pixel(pixels, 0)).toEqual([0, 255, 0]);
    const zenith = pixel(pixels, ENVIRONMENT_HEIGHT - 1);
    expect(zenith[2]).toBe(255);
    expect(zenith[0]).toBeLessThan(40);
  });

  it("is only needed when some part reflects", () => {
    expect(needsEnvironment([{}, { reflectance: 0 }])).toBe(false);
    expect(needsEnvironment([{ reflectance: 0.3 }])).toBe(true);
  });
});
