import type { Grain } from "./visual-styles/finishes.ts";

// Procedural detail laid over a surface's color: a tileable grey image (1 keeps the color, darker shades it), and
// how many metres one tile covers. Generated, never downloaded.
export type GrainImage = { size: number; pixels: Uint8Array; metres: number };

const SIZE = 128;

const METRES: Record<Grain, number> = {
  asphalt: 3,
  concrete: 4,
  grass: 2.5,
  snow: 6,
  ice: 8,
  rubber: 0.6,
  wood: 2,
  metal: 1.5,
};

// Repeatable pseudo-random value in [0, 1) for a lattice point; the same seed always gives the same image.
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// Value noise on a lattice of `across` by `down` cells that wraps around, so the tile has no seams; unequal counts
// stretch it into streaks.
function noise(u: number, v: number, across: number, down: number, seed: number): number {
  const x = u * across;
  const y = v * down;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const wrapX = (value: number) => ((value % across) + across) % across;
  const wrapY = (value: number) => ((value % down) + down) % down;
  const a = hash(wrapX(x0), wrapY(y0), seed);
  const b = hash(wrapX(x0 + 1), wrapY(y0), seed);
  const c = hash(wrapX(x0), wrapY(y0 + 1), seed);
  const d = hash(wrapX(x0 + 1), wrapY(y0 + 1), seed);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, cells: number, seed: number): number {
  const octave = (scale: number, offset: number) => noise(u, v, cells * scale, cells * scale, seed + offset);
  return (octave(1, 0) * 4 + octave(2, 1) * 2 + octave(4, 2)) / 7;
}

// Brightness in [0, 1] of one texel of a grain at tile coordinates u, v in [0, 1).
function shade(grain: Grain, u: number, v: number, x: number, y: number): number {
  const speck = hash(x, y, 7);
  switch (grain) {
    case "asphalt":
      return 0.8 + fbm(u, v, 8, 1) * 0.14 + (speck > 0.97 ? 0.08 : speck < 0.03 ? -0.1 : 0);
    case "concrete": {
      const seam = x % (SIZE / 2) === 0 || y % (SIZE / 2) === 0 ? -0.12 : 0;
      return 0.84 + fbm(u, v, 6, 2) * 0.12 + (speck - 0.5) * 0.04 + seam;
    }
    case "grass":
      return 0.68 + fbm(u, v, 10, 3) * 0.2 + noise(u, v, 16, 64, 4) * 0.12;
    case "snow":
      return 0.9 + fbm(u, v, 4, 5) * 0.08 + (speck > 0.985 ? 0.02 : 0);
    case "ice":
      return 0.86 + fbm(u, v, 3, 6) * 0.12 + noise(u, v, 32, 3, 7) * 0.02;
    case "rubber":
      return 0.86 + (speck - 0.5) * 0.08;
    case "wood": {
      const plank = Math.floor(v * 8);
      return 0.72 + hash(plank, 0, 8) * 0.12 + noise(u, v, 24, 192, 9) * 0.1 + (y % (SIZE / 8) === 0 ? -0.14 : 0);
    }
    case "metal":
      return 0.82 + noise(u, v, 2, 96, 10) * 0.14;
  }
}

export function grainImage(grain: Grain): GrainImage {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = Math.round(Math.min(1, Math.max(0, shade(grain, x / SIZE, y / SIZE, x, y))) * 255);
      const index = (y * SIZE + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return { size: SIZE, pixels, metres: METRES[grain] };
}
