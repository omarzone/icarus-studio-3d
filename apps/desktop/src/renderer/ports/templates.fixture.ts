import type { TemplateSummary, TemplatesPort } from "./templates-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const TEMPLATES: readonly TemplateSummary[] = [
  { id: "empty-world", name: "Empty world", description: "Terrain, sky and camera ready", kind: "empty-world" },
  { id: "parking-car", name: "Parking car", description: "Learns to park with sensors", kind: "example" },
  { id: "walker-robot", name: "Walker robot", description: "Learns to walk and jump", kind: "example" },
  { id: "dancer", name: "Dancer", description: "Copies a video", kind: "motion-from-video" },
  { id: "fruit-fly", name: "Fruit fly", description: "A real fly brain in a fly body", kind: "brain-map" },
];

export function createTemplatesFixture(): TemplatesPort {
  return { listTemplates: async () => [...TEMPLATES] };
}
