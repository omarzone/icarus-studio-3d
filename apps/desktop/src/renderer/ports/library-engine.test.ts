import type { CreateObject } from "@icarus/contracts";
import { expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { communityItems, libraryItems, pieceScene, placePiece } from "./library-engine.ts";
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

it("draws a piece's card with its style, finish and glow, and lists pieces under their category", () => {
  const catalog: unknown = parking.catalog;
  if (!isLibraryCatalog(catalog)) {
    throw new Error("bad test data");
  }
  const box = catalog.pieces?.find((piece) => piece.id === "box");
  if (!box) {
    throw new Error("bad test data");
  }
  const material = {
    id: "material",
    kind: "material",
    properties: {
      color: { type: "color" as const, value: "#a8a29e" },
      style: { type: "list" as const, value: "building" },
      finish: { type: "list" as const, value: "brick" },
      emissive: { type: "slider" as const, value: 0.6 },
    },
  };
  const components = [...box.object.components.filter((component) => component.kind !== "material"), material];
  const building = { ...box, id: "building", category: "buildings" as const, object: { ...box.object, components } };
  const geom = pieceScene(building)?.geoms.find((item) => item.shape === "box");
  expect(geom).toMatchObject({ style: "building", finish: "brick", emissive: 0.6, roughness: 0.5 });
  const items = libraryItems({ ...catalog, pieces: [box, building] }, "library", "");
  expect(items.map((item) => item.group)).toEqual(["Basics", "Buildings"]);
});

it("lists community creations with their author, each opening its page", () => {
  const author = { handle: "lu", name: "Lu", initials: "LU", tone: 2 as const, creations: 2 };
  const creation = { author, votes: 3, remixes: 1, opensIn: "page" as const, picture: null };
  const items = communityItems([
    { ...creation, id: "c1", name: "Salsa Dancer", category: "Humanoids" },
    { ...creation, id: "c2", name: "Ice Rink", category: "Worlds" },
    { ...creation, id: "c3", name: "Walker", category: "Brains only" },
  ]);
  expect(items).toEqual([
    { id: "c1", name: "Salsa Dancer", kind: "body", source: "lu", group: "Humanoids", creation: "c1" },
    { id: "c2", name: "Ice Rink", kind: "environment", source: "lu", group: "Worlds", creation: "c2" },
    { id: "c3", name: "Walker", kind: "brain", source: "lu", group: "Brains only", creation: "c3" },
  ]);
});
