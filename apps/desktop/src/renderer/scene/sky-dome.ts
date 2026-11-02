import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from "three";
import type { SkyLook } from "./scene-sky.ts";

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Horizon color at and below the horizon, blending into the top color towards the zenith.
const FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
varying vec3 vDirection;
void main() {
  float height = pow(clamp(vDirection.y, 0.0, 1.0), 0.6);
  gl_FragColor = vec4(mix(horizon, top, height), 1.0);
  #include <colorspace_fragment>
}`;

// The sky as an inside-out sphere around the scene, kept inside the camera's far plane; never fogged, tone mapped or
// picked, so it shows the sky's own colors.
export function createSkyDome(
  look: Pick<SkyLook, "top" | "horizon">,
  radius: number,
): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    uniforms: { top: { value: new Color(look.top) }, horizon: { value: new Color(look.horizon) } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new Mesh(new SphereGeometry(radius, 32, 16), material);
  dome.renderOrder = -1;
  dome.raycast = () => undefined;
  return dome;
}
