import type { CreateObject, LibraryCatalog, ObjectSpec, VaultBodyInfo } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { libraryItems } from "./library-engine.ts";
import parking from "./testdata/parking-car.json";
import { vaultBodyId, vaultBodyOperations } from "./vault-bodies.ts";

function part(id: string, parent: string | null, position: [number, number, number]): ObjectSpec {
  return {
    id,
    name: id,
    parent,
    components: [{ id: "transform", kind: "transform", properties: { position: { type: "vector", value: position } } }],
  };
}

const spider: VaultBodyInfo = {
  id: "spider",
  label: "Spider",
  description: "Eight legs",
  family: "locomotion",
  rewards: [{ term: "forward_progress", weight: 1, params: {} }],
  color: "#5b4a8a",
  body: { id: "spider", name: "Spider", objects: [part("head", null, [0, 0, 0.13]), part("leg", "head", [0.1, 0, 0])] },
};

function fixtures() {
  const project: unknown = structuredClone(parking.project);
  const raw: unknown = { ...parking.catalog, bodies: [spider] };
  if (!isProject(project) || !isLibraryCatalog(raw)) {
    throw new Error("bad test data");
  }
  const catalog: LibraryCatalog = raw;
  return { project, catalog };
}

describe("vault bodies", () => {
  it("are listed under Bodies with their own item ids", () => {
    const { catalog } = fixtures();
    const bodies = libraryItems(catalog, "library", "spi").filter((item) => item.kind === "body");
    expect(bodies).toEqual([{ id: "vault:spider", name: "Spider", kind: "body", group: "Bodies" }]);
    expect(vaultBodyId("vault:spider")).toBe("spider");
    expect(vaultBodyId("box")).toBeNull();
  });

  it("replace the agent, stand on the spawn point and bring their family and rewards", () => {
    const { project, catalog } = fixtures();
    const operations = vaultBodyOperations(project, catalog, "spider");
    expect(operations[0]).toEqual({ op: "remove_body", body: project.bodies[0]?.id });
    const created = operations.filter((op): op is CreateObject => op.op === "create_object");
    expect(created.map((op) => [op.target, op.object.id, op.object.parent])).toEqual([
      ["spider", "head", null],
      ["spider", "leg", "head"],
    ]);
    expect(created[1]?.object.components[0]?.properties.position).toEqual({ type: "vector", value: [0.1, 0, 0] });
    expect(operations).toContainEqual({ op: "set_task_family", family: "locomotion" });
    expect(operations).toContainEqual({ op: "remove_reward_term", term: "reach_goal" });
    expect(operations.at(-1)).toEqual({ op: "set_reward_term", term: spider.rewards[0] });
  });

  it("take a prefix when the world already has one of their ids", () => {
    const { project, catalog } = fixtures();
    project.world.objects.push(part("head", null, [5, 5, 0]));
    const created = vaultBodyOperations(project, catalog, "spider").filter(
      (op): op is CreateObject => op.op === "create_object",
    );
    expect(created.map((op) => [op.target, op.object.id, op.object.parent])).toEqual([
      ["spider_spider", "spider_head", null],
      ["spider_spider", "spider_leg", "spider_head"],
    ]);
  });
});
