import { BoxGeometry, type BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { alongLongest, at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// A cross-section outline (across, up) extruded along x over `length`, centred on the origin.
function extruded(outline: Shape, length: number): BufferGeometry {
  const geometry = new ExtrudeGeometry(outline, { depth: length, bevelEnabled: false });
  return geometry.rotateY(Math.PI / 2).translate(-length / 2, 0, 0);
}

// A rounded hump across the lane, in the part's color with dark stripes.
export function speedBump(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const outline = new Shape();
      outline.moveTo(-depth / 2, -height / 2);
      outline.lineTo(depth / 2, -height / 2);
      // Control points at the top keep the curve's highest point at the top of the box.
      outline.quadraticCurveTo(depth * 0.3, height / 2, 0, height / 2);
      outline.quadraticCurveTo(-depth * 0.3, height / 2, -depth / 2, -height / 2);
      const stripes = Math.max(2, Math.round(length / 0.5));
      const pieces: Piece[] = [];
      for (let index = 0; index < stripes; index += 1) {
        const segment = extruded(outline, length / stripes);
        pieces.push([
          index % 2 === 0 ? "paint" : "trim",
          at(segment, -length / 2 + ((index + 0.5) * length) / stripes, 0, 0),
        ]);
      }
      return pieces;
    }),
  );
}

// A concrete wheel stop with two white reflector bands.
export function wheelStop(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const radius = Math.min(height, depth) * 0.25;
      const pieces: Piece[] = [["concrete", new RoundedBoxGeometry(length * 0.98, height, depth * 0.94, 2, radius)]];
      for (const side of [-1, 1]) {
        pieces.push([
          "band",
          at(new BoxGeometry(length * 0.1, height * 0.86, depth), side * length * 0.25, -height * 0.07, 0),
        ]);
      }
      return pieces;
    }),
  );
}

// A jersey barrier: a wide foot narrowing to a slim top, with a darker strip along the foot.
export function barrier(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const half = depth / 2;
      const outline = new Shape();
      outline.moveTo(-half, -height / 2);
      outline.lineTo(half, -height / 2);
      outline.lineTo(half, -height / 2 + height * 0.1);
      outline.lineTo(half * 0.55, -height / 2 + height * 0.32);
      outline.lineTo(half * 0.3, height / 2);
      outline.lineTo(-half * 0.3, height / 2);
      outline.lineTo(-half * 0.55, -height / 2 + height * 0.32);
      outline.lineTo(-half, -height / 2 + height * 0.1);
      outline.closePath();
      return [
        ["concrete", extruded(outline, length * 0.99)],
        ["shade", at(new BoxGeometry(length, height * 0.04, depth), 0, -height / 2 + height * 0.02, 0)],
      ];
    }),
  );
}

// A picket fence: posts about every 1.5 m, two rails and pickets about every 15 cm.
export function fence(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const posts = Math.min(40, Math.max(2, Math.round(length / 1.5) + 1));
      const post = Math.min(0.1, length / posts);
      const pieces: Piece[] = [];
      for (let index = 0; index < posts; index += 1) {
        const offset = -length / 2 + post / 2 + (index * (length - post)) / (posts - 1);
        pieces.push(["shade", at(new BoxGeometry(post, height, depth), offset, 0, 0)]);
      }
      for (const level of [0.28, 0.72]) {
        pieces.push([
          "wood",
          at(new BoxGeometry(length, height * 0.07, depth * 0.5), 0, -height / 2 + height * level, depth * 0.25),
        ]);
      }
      const pickets = Math.min(200, Math.max(2, Math.round(length / 0.15)));
      for (let index = 0; index < pickets; index += 1) {
        const picket = new BoxGeometry((length / pickets) * 0.6, height * 0.88, depth * 0.4);
        pieces.push([
          "wood",
          at(picket, -length / 2 + ((index + 0.5) * length) / pickets, -height * 0.06, -depth * 0.2),
        ]);
      }
      return pieces;
    }),
  );
}

// A street sign: a metal pole with a painted plate on a white border at its top.
export function sign(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (width, height, depth) => {
      const pole = Math.min(0.04, depth / 2, width / 4);
      const plate = Math.min(width * 0.75, height * 0.35);
      const border = Math.min(width, plate) * 0.06;
      return [
        ["metal", new CylinderGeometry(pole, pole, height, 12)],
        ["band", at(new BoxGeometry(width, plate, depth * 0.3), 0, height / 2 - plate / 2, -depth * 0.05)],
        [
          "paint",
          at(
            new BoxGeometry(width - 2 * border, plate - 2 * border, depth * 0.35),
            0,
            height / 2 - plate / 2,
            depth * 0.3,
          ),
        ],
      ];
    }),
  );
}

// A wet patch: a flat, wobbly pool of water inside the slab.
export function puddle({ x, y, z }: Extents): StylePart[] {
  const outline = new Shape();
  const points = 24;
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const wobble = 0.86 + 0.14 * Math.sin(angle * 3 + 0.7) * Math.cos(angle * 2);
    const px = Math.cos(angle) * (x / 2) * wobble;
    const pz = Math.sin(angle) * (z / 2) * wobble;
    if (index === 0) {
      outline.moveTo(px, pz);
    } else {
      outline.lineTo(px, pz);
    }
  }
  const depth = Math.max(y * 0.6, 0.002);
  const pool = new ExtrudeGeometry(outline, { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  return mergeByFinish([["water", at(pool, 0, -y / 2 + depth, 0)]]);
}
