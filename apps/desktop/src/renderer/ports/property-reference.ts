import type { LibraryCatalog, PropertySchema } from "@icarus/contracts";
import type { PropertyReference, PropertyType } from "./scene-port.ts";
import { toViewValue } from "./scene-views.ts";

// REF-PROPERTY-TYPES from the engine library: one real property per control type, shown at its default.
export function propertyReference(catalog: LibraryCatalog): PropertyReference {
  const seen = new Map<PropertyType, PropertySchema>();
  for (const schema of catalog.components.flatMap((kind) => kind.properties)) {
    if (!seen.has(schema.type)) {
      seen.set(schema.type, schema);
    }
  }
  const sample = (schema: PropertySchema) => ({
    id: schema.id,
    label: schema.label,
    state: "default" as const,
    ...toViewValue(schema, schema.default),
  });
  const first = [...seen.values()][0];
  return {
    types: [...seen].map(([type, schema]) => ({
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      use: schema.hint ?? `${schema.label} uses this control`,
      sample: sample(schema),
    })),
    states: first ? [{ state: "default", label: "Default", use: "The library value", sample: sample(first) }] : [],
  };
}
