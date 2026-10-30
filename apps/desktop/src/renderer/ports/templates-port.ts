import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createTemplatesFixture } from "./templates.fixture.ts";

// How a template starts: an empty world, an example project, a body that copies a video, or a real brain map.
export type TemplateKind = "empty-world" | "example" | "motion-from-video" | "brain-map";

export type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
};

export type TemplatesPort = {
  listTemplates: () => Promise<TemplateSummary[]>;
};

export const templatesPort = definePort<TemplatesPort>({
  app: {
    listTemplates: pending({
      key: "templates.list",
      summary: "Starter templates from the library",
      sprint: 3,
      ids: ["SCR-HOME", "STA-HOME-EMPTY"],
    }),
  },
  prototype: createTemplatesFixture,
});
