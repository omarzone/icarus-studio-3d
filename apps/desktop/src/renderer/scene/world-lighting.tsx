import type { SceneDescription } from "@icarus/contracts";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { domeExtras } from "./atmosphere.ts";
import { hemisphereLook, shadowCaster, shadowRadius, sunFrame } from "./scene-lighting.ts";
import { AMBIENT_INTENSITY } from "./scene-materials.ts";
import { SKY_RADIUS, type SkyLook } from "./scene-sky.ts";
import { createSkyDome } from "./sky-dome.ts";
import { createSkyEnvironment, needsEnvironment } from "./sky-environment.ts";
import { sunLight } from "./sun-light.ts";
import { sceneBounds } from "./thumbnail-framing.ts";

type SkyProps = {
  description: SceneDescription;
  look: SkyLook | null;
  scale: number;
  background: string;
  ground: string;
  // Tone mapping exposure from the sky's grade, 1 unchanged.
  exposure: number;
};

// The world's sky: a gradient dome with its sun, haze, stars and clouds, its light from above and below, its haze and
// what reflective parts mirror; without one, the flat panel color of the editor.
export function Sky({ description, look, scale, background, ground, exposure }: SkyProps) {
  const { sky, lights, geoms } = description;
  const hemisphere = hemisphereLook(look, ground, AMBIENT_INTENSITY, sky?.ambient_color);
  const extras = useMemo(() => domeExtras(sky, lights[0]), [sky, lights]);
  const dome = useMemo(() => (look ? createSkyDome(look, SKY_RADIUS * scale, extras) : null), [look, scale, extras]);
  const reflective = needsEnvironment(geoms);
  const environment = useMemo(
    () => (reflective ? createSkyEnvironment(look?.top ?? background, look?.horizon ?? background, ground) : null),
    [reflective, look, background, ground],
  );
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  useEffect(
    () => () => {
      dome?.geometry.dispose();
      dome?.material.dispose();
      environment?.dispose();
    },
    [dome, environment],
  );
  return (
    <>
      <color attach="background" args={[look?.horizon ?? background]} />
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      {dome ? <primitive object={dome} /> : null}
      {environment ? <primitive attach="environment" object={environment} /> : null}
      {look?.fog ? <fogExp2 attach="fog" args={[look.fog.color, look.fog.density]} /> : null}
    </>
  );
}

// The world's lights as suns aimed at what the scene shows; the first that allows it casts the soft shadows.
export function Suns({ description }: { description: SceneDescription }) {
  const lights = useMemo(() => {
    const bounds = sceneBounds(description.geoms, description.zones ?? []);
    const caster = shadowCaster(description.lights, description.sky?.shadows ?? true);
    const softness = shadowRadius(description.sky?.shadow_softness);
    return description.lights.map((light, index) => sunLight(sunFrame(light, bounds), index === caster, softness));
  }, [description]);
  useEffect(
    () => () => {
      for (const light of lights) {
        light.dispose();
      }
    },
    [lights],
  );
  return (
    <>
      {lights.map((light) => (
        <group key={light.uuid}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
    </>
  );
}
