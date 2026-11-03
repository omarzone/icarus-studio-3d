import type { SceneGeom } from "@icarus/contracts";
import { Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { geomObject, lampGlow } from "./geom-object.ts";

const BASE: SceneGeom = {
  name: "car",
  body: "car",
  shape: "box",
  size: [4, 1.8, 0.6],
  position: [1, 2, 0.5],
  quaternion: [1, 0, 0, 0],
  color: "#c8553d",
};

describe("geom objects", () => {
  it("lights a vehicle lamp in its own color without lighting parts that look the same", () => {
    const lamp = { ...BASE, name: "brake_light_left", color: "#d0302a", light_role: "brake" as const };
    const twin = geomObject({ ...lamp, name: "trim", light_role: null });
    const object = geomObject(lamp);
    lampGlow(object, true);
    const lit = object instanceof Mesh ? object.material : null;
    const plain = twin instanceof Mesh ? twin.material : null;
    expect(lit).toMatchObject({ emissiveIntensity: 2.5 });
    expect(lit?.emissive.getHexString()).toBe("d0302a");
    expect(plain).toMatchObject({ emissiveIntensity: 0 });
    lampGlow(object, false);
    expect(lit).toMatchObject({ emissiveIntensity: 0 });
  });

  it("draws a geom without style or surface exactly as scenes always looked: one plain matte primitive", () => {
    const object = geomObject(BASE);
    expect(object).toBeInstanceOf(Mesh);
    const material = object instanceof Mesh ? object.material : null;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect(material).toMatchObject({ roughness: 0.8, metalness: 0, map: null });
    expect(object.position.toArray()).toEqual([1, 0.5, -2]);
  });

  it("draws a styled geom as its pieces at the same pose, sharing them between copies", () => {
    const first = geomObject({ ...BASE, style: "car_body" });
    const second = geomObject({ ...BASE, name: "1:car", style: "car_body" });
    expect(first).toBeInstanceOf(Group);
    expect(first.children.length).toBeGreaterThan(1);
    expect(first.position.toArray()).toEqual([1, 0.5, -2]);
    const geometryOf = (object: typeof first, index: number) => {
      const child = object.children[index];
      return child instanceof Mesh ? child.geometry : null;
    };
    expect(geometryOf(second, 0)).toBe(geometryOf(first, 0));
  });

  it("lays the surface's grain over a ground plane and keeps paint on it from casting shadows", () => {
    const ground = geomObject({ ...BASE, name: "ground", shape: "plane", size: [100, 100, 0], surface: "asphalt" });
    const material = ground instanceof Mesh ? ground.material : null;
    expect(material?.map?.repeat.x).toBeGreaterThan(1);
    const line = geomObject({ ...BASE, name: "line", size: [5, 0.12, 0.01], style: "marking" });
    expect(line.children.every((child) => !child.castShadow)).toBe(true);
  });
});
