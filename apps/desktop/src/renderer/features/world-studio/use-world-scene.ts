import { useEffect, useRef } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { projectsPort } from "../../ports/projects-port.ts";

const DEFAULT_TEMPLATE = "empty_world";

function nameOf(template: string): string {
  const words = template.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The scene the World workspace edits: the open project in the app, the sample scene in the prototype.
// Opened from a template without a project, the app creates the project first and keeps the same screen.
export function useWorldScene(sample: string): string | null {
  const mode = useRuntimeMode();
  const project = useNavigation((state) => state.params.project);
  const template = useNavigation((state) => state.params.template) ?? DEFAULT_TEMPLATE;
  const replaceParams = useNavigation((state) => state.replaceParams);
  const port = usePort(projectsPort);
  const create = useEngineAction(port.createProject);
  const started = useRef(false);
  const needsProject = mode === "app" && !project;
  useEffect(() => {
    if (!needsProject || started.current) {
      return;
    }
    started.current = true;
    create.mutate(
      { template, name: nameOf(template) },
      { onSuccess: (created) => replaceParams({ project: created.id }) },
    );
  }, [needsProject, template, create, replaceParams]);
  if (mode === "prototype") {
    return sample;
  }
  return project ?? null;
}
