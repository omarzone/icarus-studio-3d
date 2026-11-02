import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { templateView } from "./project-views.ts";
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
    listTemplates: async () => (await engineApi.library()).templates.map(templateView),
  },
  prototype: createTemplatesFixture,
});
