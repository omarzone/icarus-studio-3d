import { PNG } from "pngjs";
import { expect, it } from "vitest";
import { compareImages } from "./compare.ts";

type Rgba = [number, number, number, number];

function solid(width: number, height: number, color: Rgba): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data.set(color, i * 4);
  }
  return png;
}

function paint(png: PNG, box: { x: number; y: number; w: number; h: number }, color: Rgba): void {
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      png.data.set(color, (y * png.width + x) * 4);
    }
  }
}

it("returns zero for identical images and ignores masked pixels", () => {
  const a = solid(10, 10, [18, 18, 18, 255]);
  const b = solid(10, 10, [18, 18, 18, 255]);
  paint(b, { x: 0, y: 0, w: 5, h: 10 }, [255, 0, 0, 255]);
  expect(compareImages(a, a, []).ratio).toBe(0);
  expect(compareImages(a, b, [{ x: 0, y: 0, w: 5, h: 10 }]).ratio).toBe(0);
  expect(compareImages(a, b, []).ratio).toBeCloseTo(0.5);
});
