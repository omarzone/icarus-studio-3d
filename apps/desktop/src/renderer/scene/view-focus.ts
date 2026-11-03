type Point = [number, number, number];

// Where the middle of the editable 3D view meets the ground level, in MuJoCo axes; the World toolbar inserts parts
// there. View state only, kept outside React (and away from the 3D renderer's modules) so reading it is free.
let focus: Point = [0, 0, 0];

export function viewFocus(): Point {
  return focus;
}

export function setViewFocus(point: Point) {
  focus = point;
}
