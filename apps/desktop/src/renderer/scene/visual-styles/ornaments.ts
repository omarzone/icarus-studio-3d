import type { SceneOrnament } from "@icarus/contracts";
import { BoxGeometry, ConeGeometry, ExtrudeGeometry, IcosahedronGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bush } from "./nature.ts";
import { letterP } from "./road-paint.ts";
import { at, type Extents, mergeByFinish, type Piece, piecesOf, type StylePart } from "./style-parts.ts";

// An ornament's pieces in its own color and in its accent color (stripes, a sign's symbol, a lamp's light, flowers).
// Like a style, every piece stays inside the ornament's own extents; unlike a style, those extents are no collider:
// an ornament is drawn at its designed size and nothing ever touches it.
export type OrnamentParts = { main: StylePart[]; accent: StylePart[] };

// An ornament's full extents in its own Three.js frame (its local z, up, is Three's y).
export function ornamentExtents({ size: [x, y, z] }: Pick<SceneOrnament, "size">): Extents {
  return { x, y: z, z: y };
}

// Low-poly tiers of a conifer, each a 7-sided cone: [share of the height its middle sits at, share of the width].
const TIERS = [
  [0.3, 1],
  [0.55, 0.78],
  [0.78, 0.55],
] as const;

function crownCone({ x, y, z }: Extents): Piece[] {
  const tier = y * 0.44;
  return TIERS.map(([height, width]) => [
    "foliage",
    at(new ConeGeometry((Math.min(x, z) / 2) * width, tier, 7), 0, -y / 2 + y * height, 0),
  ]);
}

function crownOval({ x, y, z }: Extents): Piece[] {
  return [
    ["foliage", at(new IcosahedronGeometry(1, 1).scale(x * 0.5, y * 0.36, z * 0.5), 0, y * 0.14, 0)],
    ["foliage", at(new IcosahedronGeometry(1, 0).scale(x * 0.42, y * 0.2, z * 0.42), 0, -y * 0.28, 0)],
  ];
}

// An arm along x from the pole (−x) with a lamp housing at its far end and its light underneath.
function lampArm({ x, y, z }: Extents): OrnamentParts {
  const arm = Math.min(y * 0.2, 0.09);
  const head = x * 0.32;
  const housing = y * 0.45;
  const headX = x / 2 - head / 2;
  const headY = y / 2 - arm - housing / 2;
  return {
    main: mergeByFinish([
      ["paint", at(new BoxGeometry(x - head * 0.5, arm, arm), -head * 0.25, y / 2 - arm / 2, 0)],
      ["paint", at(new BoxGeometry(arm, y * 0.5, arm), -x / 2 + arm / 2, y / 4, 0)],
      ["paint", at(new RoundedBoxGeometry(head, housing, z, 2, Math.min(housing, z) * 0.25), headX, headY, 0)],
    ]),
    accent: mergeByFinish([
      ["lamp", at(new BoxGeometry(head * 0.84, y * 0.06, z * 0.8), headX, headY - housing / 2 - y * 0.03 + 0.001, 0)],
    ]),
  };
}

// A barrier boom along x in alternating stripes about 0.45 m long, with a dark counterweight at the pivot end.
function gateArm({ x, y, z }: Extents): OrnamentParts {
  const count = Math.max(2, Math.round(x / 0.45));
  const main: Piece[] = [];
  const accent: Piece[] = [];
  for (let index = 0; index < count; index += 1) {
    const stripe = at(new BoxGeometry(x / count, y * 0.9, z * 0.9), -x / 2 + ((index + 0.5) * x) / count, 0, 0);
    (index % 2 === 0 ? main : accent).push(["paint", stripe]);
  }
  main.push(["trim", at(new BoxGeometry(x * 0.06, y, z), -x / 2 + x * 0.03, 0, 0)]);
  return { main: mergeByFinish(main), accent: mergeByFinish(accent) };
}

// A sign plate facing ±x with a P standing out on both faces.
function signPlate({ x, y, z }: Extents): OrnamentParts {
  const depth = x * 0.2;
  const glyph = () => new ExtrudeGeometry(letterP(z * 0.5, y * 0.7), { depth, bevelEnabled: false, curveSegments: 8 });
  return {
    main: mergeByFinish([["paint", new RoundedBoxGeometry(x * 0.6, y, z, 2, Math.min(y, z) * 0.06)]]),
    accent: mergeByFinish([
      [
        "paint",
        glyph()
          .rotateY(Math.PI / 2)
          .translate(x / 2 - depth, 0, 0),
      ],
      [
        "paint",
        glyph()
          .rotateY(-Math.PI / 2)
          .translate(-x / 2 + depth, 0, 0),
      ],
    ]),
  };
}

// Leafy clumps filling a planter, with flowers dotted on top.
function shrubs({ x, y, z }: Extents): OrnamentParts {
  const clumps = Math.max(1, Math.round(x / Math.max(z, 0.3)));
  const each = x / clumps;
  const main: Piece[] = [];
  const accent: Piece[] = [];
  for (let index = 0; index < clumps; index += 1) {
    const cx = -x / 2 + (index + 0.5) * each;
    main.push(...piecesOf(bush({ x: each, y: y * 0.9, z }), cx, -y * 0.05, 0));
    const flower = Math.min(each, z, y) * 0.09;
    for (const [fx, fz] of [
      [-0.2, 0.15],
      [0.18, -0.12],
    ] as const) {
      accent.push(["paint", at(new IcosahedronGeometry(flower, 0), cx + fx * each, y / 2 - flower, fz * z)]);
    }
  }
  return { main: mergeByFinish(main), accent: mergeByFinish(accent) };
}

const leaves = (pieces: Piece[]): OrnamentParts => ({ main: mergeByFinish(pieces), accent: [] });

// The pieces an ornament is drawn with, inside its own extents.
export function ornamentParts(ornament: Pick<SceneOrnament, "style" | "size">): OrnamentParts {
  const extents = ornamentExtents(ornament);
  switch (ornament.style) {
    case "crown_round":
      return { main: bush(extents), accent: [] };
    case "crown_cone":
      return leaves(crownCone(extents));
    case "crown_oval":
      return leaves(crownOval(extents));
    case "lamp_arm":
      return lampArm(extents);
    case "gate_arm":
      return gateArm(extents);
    case "sign_plate":
      return signPlate(extents);
    case "shrubs":
      return shrubs(extents);
  }
}
