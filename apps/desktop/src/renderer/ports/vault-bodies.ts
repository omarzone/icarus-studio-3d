import type { EditOperation, LibraryCatalog, ObjectSpec, Project, VaultBodyInfo } from "@icarus/contracts";
import type { LibraryItem } from "./library-port.ts";

// Vault bodies share the library shelf with pieces, so their item ids carry this mark.
const VAULT_MARK = "vault:";

export function vaultItems(catalog: LibraryCatalog, query: string): LibraryItem[] {
  return (catalog.bodies ?? [])
    .filter((body) => !query || body.label.toLowerCase().includes(query))
    .map((body) => ({ id: `${VAULT_MARK}${body.id}`, name: body.label, kind: "body", group: "Bodies" }));
}

export function vaultBodyId(itemId: string): string | null {
  return itemId.startsWith(VAULT_MARK) ? itemId.slice(VAULT_MARK.length) : null;
}

function spawnSpot(project: Project): [number, number] {
  for (const obj of project.world.objects) {
    if (obj.components.some((component) => component.kind === "spawn_point")) {
      const position = obj.components.find((component) => component.kind === "transform")?.properties.position;
      return position?.type === "vector" ? [position.value[0], position.value[1]] : [0, 0];
    }
  }
  return [0, 0];
}

// The object with its id and parent prefixed and, for the root, moved over the spawn point.
function placed(obj: ObjectSpec, prefix: string, [x, y]: [number, number]): ObjectSpec {
  const components = obj.components.map((component) => {
    const position = component.properties.position;
    if (obj.parent !== null || component.kind !== "transform" || position?.type !== "vector") {
      return component;
    }
    const value: [number, number, number] = [position.value[0] + x, position.value[1] + y, position.value[2]];
    return { ...component, properties: { ...component.properties, position: { type: "vector" as const, value } } };
  });
  const parent = obj.parent === null ? null : `${prefix}${obj.parent}`;
  return { ...obj, id: `${prefix}${obj.id}`, parent, components };
}

function fitsFamily(catalog: LibraryCatalog, term: string, family: VaultBodyInfo["family"]): boolean {
  const info = catalog.reward_terms.find((item) => item.term === term);
  const families = info?.families?.length ? info.families : info ? [info.family] : [];
  return families.includes(family);
}

// The operations that make a vault body the project's agent, as the engine's use_vault_body builds them: the
// bodies it has go, the vault body stands on the spawn point, and a task of another family becomes the body's own.
export function vaultBodyOperations(project: Project, catalog: LibraryCatalog, bodyId: string): EditOperation[] {
  const vault = (catalog.bodies ?? []).find((item) => item.id === bodyId);
  if (!vault) {
    throw new Error(`${bodyId} is not in the body vault`);
  }
  const worldIds = new Set(project.world.objects.map((obj) => obj.id));
  const prefix = vault.body.objects.some((obj) => worldIds.has(obj.id)) ? `${bodyId}_` : "";
  const spot = spawnSpot(project);
  const id = `${prefix}${vault.body.id}`;
  const operations: EditOperation[] = project.bodies.map((body) => ({ op: "remove_body", body: body.id }));
  operations.push({ op: "add_body", body: { id, name: vault.body.name, objects: [] } });
  for (const obj of vault.body.objects) {
    operations.push({ op: "create_object", target: id, object: placed(obj, prefix, spot) });
  }
  if (project.task.family !== vault.family) {
    operations.push({ op: "set_task_family", family: vault.family });
    for (const reward of project.task.rewards) {
      if (!fitsFamily(catalog, reward.term, vault.family)) {
        operations.push({ op: "remove_reward_term", term: reward.term });
      }
    }
    for (const reward of vault.rewards) {
      operations.push({ op: "set_reward_term", term: reward });
    }
  }
  return operations;
}
