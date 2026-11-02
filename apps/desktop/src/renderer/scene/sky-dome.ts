import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import type { DomeExtras } from "./atmosphere.ts";
import type { SkyLook } from "./scene-sky.ts";

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Horizon color at and below the horizon, blending into the top color towards the zenith. Each extra is skipped at
// zero, so a sky without them draws exactly the two-color gradient.
const FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDirection;
uniform float sunRadius;
uniform vec3 sunColor;
uniform float glare;
uniform float haze;
uniform float stars;
uniform float cloudCover;
uniform float cloudDensity;
uniform vec3 cloudColor;
varying vec3 vDirection;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + 1.0), f.x), f.y),
    f.z);
}

void main() {
  float up = clamp(vDirection.y, 0.0, 1.0);
  vec3 color = mix(horizon, top, pow(up, 0.6));
  vec3 dir = normalize(vDirection);
  float skyLight = clamp(dot(mix(horizon, top, 0.5), vec3(0.299, 0.587, 0.114)) * 1.6, 0.12, 1.0);
  if (haze > 0.0) {
    color = mix(color, vec3(mix(0.35, 1.0, skyLight)), haze * pow(1.0 - up, 4.0) * 0.7);
  }
  if (stars > 0.0 && dir.y > 0.0) {
    float dark = 1.0 - smoothstep(0.04, 0.3, dot(top, vec3(0.299, 0.587, 0.114)));
    vec3 cell = floor(dir * 400.0);
    float lit = step(1.0 - 0.006 * stars, hash(cell));
    color += vec3(lit * dark * smoothstep(0.0, 0.2, dir.y) * (0.5 + 0.5 * hash(cell + 3.1)));
  }
  float toSun = dot(dir, sunDirection);
  if (glare > 0.0) {
    color += sunColor * glare * (pow(max(toSun, 0.0), 96.0) * 0.9 + pow(max(toSun, 0.0), 8.0) * 0.3);
  }
  if (sunRadius > 0.0 && dir.y > -0.02) {
    float disc = smoothstep(cos(sunRadius * 1.2), cos(sunRadius), toSun);
    color = mix(color, sunColor + 0.15, disc);
  }
  if (cloudCover > 0.0 && dir.y > 0.0) {
    vec2 plane = dir.xz / (dir.y + 0.12) * 1.4;
    float n = noise(vec3(plane, 0.0)) * 0.533 + noise(vec3(plane * 2.0, 1.7)) * 0.267
      + noise(vec3(plane * 4.0, 3.1)) * 0.133 + noise(vec3(plane * 8.0, 5.3)) * 0.067;
    float edge = 1.0 - cloudCover;
    float mask = smoothstep(edge, edge + 0.2, n) * smoothstep(0.0, 0.15, dir.y);
    float shade = mix(1.0, 0.55, cloudDensity * smoothstep(edge, 1.0, n));
    color = mix(color, cloudColor * shade * skyLight, mask * mix(0.45, 1.0, cloudDensity));
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

const NONE: DomeExtras = {
  sunDirection: [0, 1, 0],
  sunRadius: 0,
  sunColor: "#ffffff",
  glare: 0,
  haze: 0,
  stars: 0,
  clouds: { cover: 0, density: 0, color: "#ffffff" },
};

// The sky as an inside-out sphere around the scene, kept inside the camera's far plane; never fogged, tone mapped or
// picked, so it shows the sky's own colors.
export function createSkyDome(
  look: Pick<SkyLook, "top" | "horizon">,
  radius: number,
  extras: DomeExtras = NONE,
): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    uniforms: {
      top: { value: new Color(look.top) },
      horizon: { value: new Color(look.horizon) },
      sunDirection: { value: new Vector3(...extras.sunDirection) },
      sunRadius: { value: extras.sunRadius },
      sunColor: { value: new Color(extras.sunColor) },
      glare: { value: extras.glare },
      haze: { value: extras.haze },
      stars: { value: extras.stars },
      cloudCover: { value: extras.clouds.cover },
      cloudDensity: { value: extras.clouds.density },
      cloudColor: { value: new Color(extras.clouds.color) },
    },
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
