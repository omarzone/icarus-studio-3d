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
  brick: 1.2,
  tiles: 1.2,
  road: 6,
  fabric: 0.4,
  // Two blocks of a metre each way, in two tones like a checkerboard.
  blocks: 2,
  plastic: 2,
  sand: 3,
  dirt: 4,
  stone: 3,
  glass: 4,
  wood_grain: 2,
  // Four by four stones of a quarter metre.
  cobblestone: 1,
  // Eight by eight raised diamonds.
  diamond_plate: 0.6,
  corroded: 2,
  marble: 3,
  granite: 1.5,
  foil: 0.8,
};

export function grainMetres(grain: Grain): number {
  return METRES[grain];
}

// Rows and columns of a brick bond or a tile grid in one tile, and the joint width in texels.
const BRICK_ROWS = 16;
const BRICKS_PER_ROW = 4;
const TILES = 4;
// Share of a block's side taken by the dark seam between blocks, and by the rounded edge shading inside it.
const BLOCK_SEAM = 0.015;
const BLOCK_EDGE = 0.08;

// One face of a cube block: two tones in a checkerboard, a dark seam around it and its edge lit from the top left.
function block(u: number, v: number, speck: number): number {
  const fu = (u * 2) % 1;
  const fv = (v * 2) % 1;
  const tone = (Math.floor(u * 2) + Math.floor(v * 2)) % 2 === 0 ? 0.95 : 0.8;
  const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
  if (edge < BLOCK_SEAM) {
    return 0.45;
  }
  const lit = Math.min(fu, fv) < Math.min(1 - fu, 1 - fv) ? 0.06 : -0.08;
  const rim = edge < BLOCK_EDGE ? lit * (1 - edge / BLOCK_EDGE) : 0;
  return tone + rim + (speck - 0.5) * 0.02;
}

function joint(x: number, y: number, rows: number, columns: number, offset: boolean): boolean {
  const rowHeight = SIZE / rows;
  const row = Math.floor(y / rowHeight);
  const columnWidth = SIZE / columns;
  const shift = offset && row % 2 === 1 ? columnWidth / 2 : 0;
  return y % rowHeight < 1.5 || (x + shift) % columnWidth < 1.5;
}

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
    case "brick": {
      if (joint(x, y, BRICK_ROWS, BRICKS_PER_ROW, true)) {
        return 1;
      }
      const row = Math.floor(v * BRICK_ROWS);
      const brick = Math.floor(((u + (row % 2) / (2 * BRICKS_PER_ROW)) % 1) * BRICKS_PER_ROW);
      return 0.62 + hash(brick, row, 11) * 0.16 + fbm(u, v, 12, 12) * 0.1;
    }
    case "tiles":
      return joint(x, y, TILES, TILES, false) ? 0.6 : 0.9 + fbm(u, v, 4, 13) * 0.06 + (speck - 0.5) * 0.02;
    // Asphalt with a dashed lane line along the tile's middle; the road finish keeps its own colors.
    case "road": {
      const line = Math.abs(y - SIZE / 2) < 2 && x % (SIZE / 2) < SIZE / 4;
      return line ? 0.92 : 0.2 + fbm(u, v, 8, 14) * 0.06 + (speck > 0.97 ? 0.04 : 0);
    }
    case "blocks":
      return block(u, v, speck);
    case "fabric": {
      const warp = Math.sin(x * Math.PI * 0.5) * Math.sin(y * Math.PI * 0.5);
      return 0.8 + warp * 0.08 + fbm(u, v, 6, 15) * 0.08;
    }
    case "plastic":
      return 0.95 + fbm(u, v, 4, 16) * 0.04 + (speck - 0.5) * 0.01;
    case "sand":
      return 0.82 + noise(u, v, 6, 24, 17) * 0.06 + (speck - 0.5) * 0.14;
    case "dirt":
      return 0.62 + fbm(u, v, 7, 18) * 0.26 + (speck > 0.94 ? -0.1 : 0);
    case "stone":
      return 0.74 + fbm(u, v, 5, 19) * 0.2 + (speck - 0.5) * 0.05;
    case "glass":
      return 0.98 + fbm(u, v, 2, 20) * 0.02;
    case "wood_grain":
      return 0.7 + noise(u, v, 6, 96, 21) * 0.16 + Math.sin((v + fbm(u, v, 3, 22) * 0.2) * Math.PI * 20) * 0.04;
    case "cobblestone":
      return cobble(u, v, speck);
    case "diamond_plate":
      return diamond(u, v);
    case "corroded": {
      const rust = fbm(u, v, 5, 23);
      return rust > 0.55 ? 0.5 + rust * 0.25 : 0.82 + noise(u, v, 2, 64, 24) * 0.12;
    }
    case "marble": {
      const vein = Math.abs(Math.sin((u + v + fbm(u, v, 4, 25) * 0.9) * Math.PI * 4));
      return 0.95 - (vein < 0.08 ? (0.08 - vein) * 3 : 0) + (speck - 0.5) * 0.02;
    }
    case "granite":
      return 0.72 + fbm(u, v, 8, 26) * 0.12 + (speck > 0.9 ? 0.18 : speck < 0.12 ? -0.2 : 0);
    case "foil":
      return 0.78 + Math.abs(noise(u, v, 12, 12, 27) - 0.5) * 0.4 + fbm(u, v, 6, 28) * 0.1;
  }
}

// Rounded stones on a jittered grid of four by four: lit in the middle, darker toward their edges, mortar between.
const STONES = 4;
function cobble(u: number, v: number, speck: number): number {
  const cellU = Math.floor(u * STONES);
  const cellV = Math.floor(v * STONES);
  let nearest = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  let tone = 0;
  for (let dv = -1; dv <= 1; dv += 1) {
    for (let du = -1; du <= 1; du += 1) {
      const cu = cellU + du;
      const cv = cellV + dv;
      const wrapU = ((cu % STONES) + STONES) % STONES;
      const wrapV = ((cv % STONES) + STONES) % STONES;
      const pu = (cu + 0.25 + hash(wrapU, wrapV, 29) * 0.5) / STONES;
      const pv = (cv + 0.25 + hash(wrapU, wrapV, 30) * 0.5) / STONES;
      const distance = Math.hypot(u - pu, v - pv) * STONES;
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
        tone = hash(wrapU, wrapV, 31);
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  const gap = second - nearest;
  if (gap < 0.08) {
    return 0.45;
  }
  return 0.7 + tone * 0.15 - nearest * 0.12 + (speck - 0.5) * 0.04;
}

// Raised diamonds in alternating directions on a brushed metal plate, each lit on one side.
const DIAMONDS = 8;
function diamond(u: number, v: number): number {
  const fu = (u * DIAMONDS) % 1;
  const fv = (v * DIAMONDS) % 1;
  const flip = (Math.floor(u * DIAMONDS) + Math.floor(v * DIAMONDS)) % 2 === 0;
  const along = flip ? fu - fv : fu + fv - 1;
  const across = flip ? fu + fv - 1 : fu - fv;
  const raised = Math.abs(along) < 0.12 && Math.abs(across) < 0.5;
  const brushed = 0.82 + noise(u, v, 2, 96, 32) * 0.08;
  return raised ? brushed + (across > 0 ? 0.12 : -0.1) : brushed;
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
