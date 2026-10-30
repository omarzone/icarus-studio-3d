import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Box = { x: number; y: number; w: number; h: number };

function masked(source: PNG, from: PNG, masks: Box[]): PNG {
  const copy = new PNG({ width: source.width, height: source.height });
  source.data.copy(copy.data);
  for (const { x, y, w, h } of masks) {
    for (let row = Math.max(0, y); row < Math.min(source.height, y + h); row++) {
      const start = (row * source.width + Math.max(0, x)) * 4;
      const end = (row * source.width + Math.min(source.width, x + w)) * 4;
      from.data.copy(copy.data, start, start, end);
    }
  }
  return copy;
}

export function compareImages(reference: PNG, actual: PNG, masks: Box[]): { ratio: number; diff: PNG } {
  const { width, height } = reference;
  const diff = new PNG({ width, height });
  const same = masked(actual, reference, masks);
  const changed = pixelmatch(reference.data, same.data, diff.data, width, height, { threshold: 0.1 });
  return { ratio: changed / (width * height), diff };
}
