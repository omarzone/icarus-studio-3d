import { useFrame, useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { fromThreePosition } from "./coordinates.ts";
import { setViewFocus } from "./view-focus.ts";

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const CENTER = new Vector2(0, 0);
const PROBE = new Raycaster();
// Never further than this from the camera, so a view of the horizon does not insert parts out of sight.
const FARTHEST = 60;
const AHEAD = 10;

// The point on the ground level the ray meets, or one a little ahead of the camera when it looks up or too far.
export function groundOnRay(raycaster: Raycaster): [number, number, number] {
  const hit = new Vector3();
  const ray = raycaster.ray;
  const found = ray.intersectPlane(GROUND, hit);
  if (!found || hit.distanceTo(ray.origin) > FARTHEST) {
    const ahead = ray.at(AHEAD, new Vector3());
    return fromThreePosition([ahead.x, 0, ahead.z]);
  }
  return fromThreePosition([hit.x, 0, hit.z]);
}

// Keeps `viewFocus` on the ground under the middle of the screen while the editable view is shown.
export function ViewFocusProbe() {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    PROBE.setFromCamera(CENTER, camera);
    setViewFocus(groundOnRay(PROBE));
  });
  return null;
}
