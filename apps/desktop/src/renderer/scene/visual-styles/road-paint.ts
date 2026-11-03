import { BoxGeometry, type BufferGeometry, ExtrudeGeometry, Path, Shape } from "three";
import { alongLongest, at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// Zebra stripes and dashes keep their real size; the most a huge part draws keeps it cheap.
const STRIPE = 0.5;
const DASH = 3;
const MOST = 60;

// A capital P, `width` across and `height` tall, centered on the origin of its plane (x right, y up).
export function letterP(width: number, height: number): Shape {
  const stroke = width * 0.24;
  const radius = (height * 0.56) / 2;
  const left = -width / 2;
  const top = height / 2;
  const bowl = top - 2 * radius;
  const cx = width / 2 - radius;
  const cy = top - radius;
  const outline = new Shape();
  outline.moveTo(left, -top);
  outline.lineTo(left + stroke, -top);
  outline.lineTo(left + stroke, bowl);
  outline.lineTo(cx, bowl);
  outline.absarc(cx, cy, radius, -Math.PI / 2, Math.PI / 2, false);
  outline.lineTo(left, top);
  outline.closePath();
  const hole = new Path();
  hole.moveTo(left + stroke, bowl + stroke);
  hole.lineTo(cx, bowl + stroke);
  hole.absarc(cx, cy, radius - stroke, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(left + stroke, top - stroke);
  hole.closePath();
  outline.holes.push(hole);
  return outline;
}

// A flat shape lying on the ground, its plane's up along +x and its right along Three's +z, `thick` high and centered.
function lying(shape: Shape, thick: number): BufferGeometry {
  const geometry = new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 10 });
  // The extrusion runs along +z; turned so it rises along +y with the plane's up along x and right along z.
  return geometry
    .rotateX(-Math.PI / 2)
    .rotateY(-Math.PI / 2)
    .translate(0, -thick / 2, 0);
}

// Zebra stripes running along x, repeated across z with gaps as wide as the stripes.
export function crosswalk({ x, y, z }: Extents): StylePart[] {
  const count = Math.min(MOST, Math.max(1, Math.floor(z / (2 * STRIPE))));
  const width = Math.min(STRIPE, z);
  const pieces: Piece[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) / 2) * 2 * STRIPE;
    pieces.push(["marking", at(new BoxGeometry(x, Math.max(y, 0.002), width), 0, 0, offset)]);
  }
  return mergeByFinish(pieces);
}

// A dashed line along the part's longest side: dashes and gaps of 3 m, centered, never past its ends.
export function dashedLine(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const count = Math.min(MOST, Math.max(1, Math.floor((length + DASH) / (2 * DASH))));
      const dash = Math.min(DASH, length);
      const pieces: Piece[] = [];
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * 2 * DASH;
        pieces.push(["marking", at(new BoxGeometry(dash, Math.max(height, 0.002), depth), offset, 0, 0)]);
      }
      return pieces;
    }),
  );
}

// A capital P painted on the ground, its top toward +x.
export function parkingMark({ x, y, z }: Extents): StylePart[] {
  return mergeByFinish([["marking", lying(letterP(z * 0.9, x * 0.9), Math.max(y, 0.002))]]);
}

// A straight arrow painted on a lane, pointing along +x: a shaft under a wide head.
export function roadArrow({ x, y, z }: Extents): StylePart[] {
  const length = x * 0.98;
  const head = length * 0.38;
  const shaft = z * 0.32;
  const arrow = new Shape();
  arrow.moveTo(-shaft / 2, -length / 2);
  arrow.lineTo(shaft / 2, -length / 2);
  arrow.lineTo(shaft / 2, length / 2 - head);
  arrow.lineTo((z * 0.98) / 2, length / 2 - head);
  arrow.lineTo(0, length / 2);
  arrow.lineTo((-z * 0.98) / 2, length / 2 - head);
  arrow.lineTo(-shaft / 2, length / 2 - head);
  arrow.closePath();
  return mergeByFinish([["marking", lying(arrow, Math.max(y, 0.002))]]);
}
