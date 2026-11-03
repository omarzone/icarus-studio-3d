import { COMPONENT_GROUPS } from "./component-kinds.fixture.ts";
import { formatPropertyValue } from "./property-format.ts";
import { PROPERTY_REFERENCE } from "./property-reference.fixture.ts";
import { SCENE_DOCUMENTS, type SceneDocument } from "./scene-documents.fixture.ts";
import type { Inspection, InspectorSection, Property, PropertyValue, SceneObject, ScenePort } from "./scene-port.ts";

const NO_COPIES = { copies: 1, layout: "Single", layouts: ["Single"], variations: [] } as const;

function inspectionOf(document: SceneDocument): Inspection {
  const selected = document.tree.selected ?? "";
  const known = document.inspections[selected];
  if (known) {
    return known;
  }
  const object = document.tree.sections.flatMap((section) => section.objects).find((item) => item.id === selected);
  return object ? plainInspection(object) : { kind: "nothing" };
}

function plainInspection(object: SceneObject): Inspection {
  return {
    kind: "object",
    title: object.name,
    subtitle: object.meta ?? "",
    icon: object.icon,
    sections: [],
    components: true,
  };
}

function withValue(property: Property, value: PropertyValue): Property {
  const was = property.state === "changed" ? property.was : formatPropertyValue(property);
  return { ...property, ...value, state: "changed", was, proposed: undefined };
}

// In-memory project documents that behave: selecting selects, editing edits, resetting resets.
export function createSceneFixture(): ScenePort {
  const documents = new Map<string, SceneDocument>(Object.entries(SCENE_DOCUMENTS));
  const originals = new Map<string, Inspection>();
  const find = (scene: string) => {
    const document = documents.get(scene);
    if (!document) {
      throw new Error(`No scene ${scene}`);
    }
    return document;
  };
  const save = (scene: string, document: SceneDocument) => {
    documents.set(scene, document);
    return document;
  };
  const editProperty = (scene: string, section: string, property: string, edit: (item: Property) => Property) => {
    const document = find(scene);
    const inspection = inspectionOf(document);
    if (inspection.kind !== "object") {
      return inspection;
    }
    const key = `${scene}/${document.tree.selected ?? ""}`;
    if (!originals.has(key)) {
      originals.set(key, inspection);
    }
    const sections: InspectorSection[] = inspection.sections.map((item) =>
      item.id === section
        ? { ...item, properties: item.properties.map((prop) => (prop.id === property ? edit(prop) : prop)) }
        : item,
    );
    const next: Inspection = { ...inspection, sections };
    save(scene, { ...document, inspections: { ...document.inspections, [document.tree.selected ?? ""]: next } });
    return next;
  };
  const originalProperty = (scene: string, section: string, property: string): Property | undefined => {
    const document = find(scene);
    const original = originals.get(`${scene}/${document.tree.selected ?? ""}`) ?? inspectionOf(document);
    if (original.kind !== "object") {
      return undefined;
    }
    return original.sections.find((item) => item.id === section)?.properties.find((item) => item.id === property);
  };
  return {
    getTree: async (scene) => find(scene).tree,
    selectObject: async ({ scene, id }) => {
      const document = find(scene);
      return save(scene, { ...document, tree: { ...document.tree, selected: id } }).tree;
    },
    // Sample scenes have no component kinds to look up; the selection stays.
    selectKind: async () => null,
    getInspection: async (scene) => inspectionOf(find(scene)),
    setProperty: async ({ scene, section, property, value }) =>
      editProperty(scene, section, property, (item) => withValue(item, value)),
    resetProperty: async ({ scene, section, property }) => {
      const original = originalProperty(scene, section, property);
      return editProperty(scene, section, property, (item) =>
        original && original.state !== "changed" ? original : { ...item, state: "default", was: undefined },
      );
    },
    acceptProposedValue: async ({ scene, section, property }) =>
      editProperty(scene, section, property, (item) => (item.proposed ? withValue(item, item.proposed) : item)),
    // Brain samples keep their settings as the selected inspection.
    getBrainSettings: async (scene) => inspectionOf(find(scene)),
    setBrainSetting: async ({ scene, section, property, value }) =>
      editProperty(scene, section, property, (item) => withValue(item, value)),
    resetBrainSetting: async ({ scene, section, property }) =>
      editProperty(scene, section, property, (item) => originalProperty(scene, section, property) ?? item),
    listComponentKinds: async () => [...COMPONENT_GROUPS],
    addComponent: async ({ scene, kind }) => {
      const document = find(scene);
      const inspection = inspectionOf(document);
      const label = COMPONENT_GROUPS.flatMap((group) => group.kinds).find((item) => item.id === kind);
      if (inspection.kind !== "object" || !label) {
        return inspection;
      }
      const added: InspectorSection = {
        id: `${kind}-${inspection.sections.length}`,
        title: label.label,
        icon: label.icon,
        properties: [],
      };
      const next: Inspection = { ...inspection, sections: [...inspection.sections, added] };
      save(scene, { ...document, inspections: { ...document.inspections, [document.tree.selected ?? ""]: next } });
      return next;
    },
    removeComponent: async ({ scene, section }) => {
      const document = find(scene);
      const inspection = inspectionOf(document);
      if (inspection.kind !== "object") {
        return inspection;
      }
      const next: Inspection = { ...inspection, sections: inspection.sections.filter((item) => item.id !== section) };
      save(scene, { ...document, inspections: { ...document.inspections, [document.tree.selected ?? ""]: next } });
      return next;
    },
    getTrainingCopies: async (scene) => find(scene).copies ?? NO_COPIES,
    setTrainingCopies: async ({ scene, copies, layout }) => {
      const document = find(scene);
      const next = { ...(document.copies ?? NO_COPIES), copies, layout };
      save(scene, { ...document, copies: next });
      return next;
    },
    getCopyScenes: async () => [],
    toggleVariation: async ({ scene, id }) => {
      const document = find(scene);
      const current = document.copies ?? NO_COPIES;
      const next = {
        ...current,
        variations: current.variations.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
      };
      save(scene, { ...document, copies: next });
      return next;
    },
    getGuide: async (scene) => find(scene).guide,
    getPropertyReference: async () => PROPERTY_REFERENCE,
    getSceneDescription: async () => null,
    // The prototype has no 3D scene to drag in.
    moveObject: async ({ scene }) => inspectionOf(find(scene)),
    rotateObject: async ({ scene }) => inspectionOf(find(scene)),
    scaleObject: async ({ scene }) => inspectionOf(find(scene)),
    // The prototype has no world to build in; parts and slabs exist only against the engine.
    insertPart: async ({ scene }) => find(scene).tree,
    makeGroundSlab: async (scene) => inspectionOf(find(scene)),
    renameObject: async ({ scene, id, name }) =>
      editRows(scene, (rows) => rows.map((row) => (row.id === id ? { ...row, name } : row))),
    duplicateObject: async ({ scene, id }) => {
      const tree = editRows(scene, (rows) => {
        const [start, end] = subtreeRange(rows, id);
        const copies = rows.slice(start, end).map((row, index) => ({
          ...row,
          id: `${row.id}-copy`,
          name: index === 0 ? `${row.name} copy` : row.name,
        }));
        return [...rows.slice(0, end), ...copies, ...rows.slice(end)];
      });
      return save(scene, { ...find(scene), tree: { ...tree, selected: `${id}-copy` } }).tree;
    },
    deleteObject: async ({ scene, id }) =>
      editRows(scene, (rows) => {
        const [start, end] = subtreeRange(rows, id);
        return [...rows.slice(0, start), ...rows.slice(end)];
      }),
    reparentObject: async ({ scene, id, parent }) =>
      editRows(scene, (rows) => {
        const [start, end] = subtreeRange(rows, id);
        const moved = rows.slice(start, end);
        const rest = [...rows.slice(0, start), ...rows.slice(end)];
        const [parentStart, parentEnd] = parent === null ? [-1, rest.length] : subtreeRange(rest, parent);
        const depth = parent === null ? 0 : (rest[parentStart]?.depth ?? -1) + 1;
        const shift = depth - (moved[0]?.depth ?? 0);
        const placed = moved.map((row) => ({ ...row, depth: row.depth + shift }));
        return [...rest.slice(0, parentEnd), ...placed, ...rest.slice(parentEnd)];
      }),
  };

  // Applies a change to the rows of the section holding them, as the engine would to the document.
  function editRows(scene: string, change: (rows: readonly SceneObject[]) => SceneObject[]) {
    const document = find(scene);
    const sections = document.tree.sections.map((section) => ({ ...section, objects: change(section.objects) }));
    return save(scene, { ...document, tree: { ...document.tree, sections } }).tree;
  }
}

// Rows of an object and everything nested under it: [first, after last); empty when it is not there.
function subtreeRange(rows: readonly SceneObject[], id: string): [number, number] {
  const start = rows.findIndex((row) => row.id === id);
  if (start < 0) {
    return [rows.length, rows.length];
  }
  const depth = rows[start]?.depth ?? 0;
  let end = start + 1;
  while (end < rows.length && (rows[end]?.depth ?? 0) > depth) {
    end++;
  }
  return [start, end];
}
