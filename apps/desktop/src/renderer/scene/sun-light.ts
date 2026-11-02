import { DirectionalLight } from "three";
import { SHADOW_BIAS, SHADOW_MAP_SIZE, SHADOW_NORMAL_BIAS, SHADOW_SOFTNESS, type SunFrame } from "./scene-lighting.ts";

// A world light as a Three sun; only the first one casts shadows, so extra lights never multiply the shadow cost.
export function sunLight(frame: SunFrame, castsShadow: boolean, softness = SHADOW_SOFTNESS): DirectionalLight {
  const light = new DirectionalLight(frame.color, frame.intensity);
  light.position.set(...frame.position);
  light.target.position.set(...frame.target);
  light.castShadow = castsShadow;
  if (castsShadow) {
    const { camera } = light.shadow;
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    light.shadow.bias = SHADOW_BIAS;
    light.shadow.normalBias = SHADOW_NORMAL_BIAS;
    light.shadow.radius = softness;
    camera.left = -frame.extent;
    camera.right = frame.extent;
    camera.top = frame.extent;
    camera.bottom = -frame.extent;
    camera.near = frame.near;
    camera.far = frame.far;
    camera.updateProjectionMatrix();
  }
  return light;
}
