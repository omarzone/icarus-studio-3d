import type { CreateObject } from "@icarus/contracts";
import { expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { pieceScene, placePiece } from "./library-engine.ts";
import parking from "./testdata/parking-car.json";

it("places a second copy of a piece next to the first, not on top of it", () => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  const position = (operation: CreateObject) =>
    operation.object.components.find((component) => component.kind === "transform")?.properties.position;
  const first = placePiece(parking.project, parking.catalog, "box");
  const withFirst = structuredClone(parking.project);
  withFirst.world.objects.push(first.object);
  const second = placePiece(withFirst, parking.catalog, "box");
  expect(second.object.id).toBe("box_2");
  expect(position(second)).not.toEqual(position(first));
});

it("draws a piece from its own shape, size, color and tilt, standing on a floor", () => {
  const catalog: unknown = parking.catalog;
  if (!isLibraryCatalog(catalog)) {
    throw new Error("bad test data");
  }
  const ramp = catalog.pieces?.find((piece) => piece.id === "ramp");
  if (!ramp) {
    throw new Error("bad test data");
  }
  const scene = pieceScene(ramp);
  const geom = scene?.geoms.find((item) => item.name === "ramp");
  expect(geom).toMatchObject({ shape: "box", size: [2, 1.5, 0.1], color: "#6b7280", position: [0, 0, 0.05] });
  expect(geom?.quaternion[2]).toBeCloseTo(-Math.sin((15 * Math.PI) / 360));
  expect(scene?.geoms.some((item) => item.shape === "plane")).toBe(true);
});

it("has no picture for a piece without a shape", () => {
  const catalog: unknown = parking.catalog;
  if (!isLibraryCatalog(catalog)) {
    throw new Error("bad test data");
  }
  const box = catalog.pieces?.find((piece) => piece.id === "box");
  if (!box) {
    throw new Error("bad test data");
  }
  const bare = { ...box, object: { ...box.object, components: [] } };
  expect(pieceScene(bare)).toBeNull();
});
