import type { CreateObject } from "@icarus/contracts";
import { expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { placePiece } from "./library-engine.ts";
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
