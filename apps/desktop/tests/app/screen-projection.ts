// Screen point of a Three world point for the viewport's starting camera (position 7, 6, 9 looking at the origin).
export type Vec = [number, number, number];

export function project(
  point: Vec,
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const eye: Vec = [7, 6, 9];
  const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec, b: Vec): Vec => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (a: Vec): Vec => {
    const length = Math.hypot(...a);
    return [a[0] / length, a[1] / length, a[2] / length];
  };
  const forward = norm(sub([0, 0, 0], eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = sub(point, eye);
  const depth = dot(relative, forward);
  const scale = 1 / Math.tan((45 * Math.PI) / 360);
  const aspect = box.width / box.height;
  const nx = (dot(relative, right) / depth) * (scale / aspect);
  const ny = (dot(relative, up) / depth) * scale;
  return { x: box.x + ((nx + 1) / 2) * box.width, y: box.y + ((1 - ny) / 2) * box.height };
}
