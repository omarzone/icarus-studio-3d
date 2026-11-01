import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { projectsPort } from "../../ports/projects-port.ts";

const DEFAULT_TEMPLATE = "empty_world";

function nameOf(template: string): string {
  const words = template.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type WorldScene =
  | { kind: "ready"; scene: string }
  | { kind: "creating" }
  | { kind: "failed"; reason: string; retry: () => void };

// The scene the World workspace edits: the open project in the app, the sample scene in the prototype.
// Opened from a template without a project, the app creates the project first and keeps the same screen.
export function useWorldScene(sample: string): WorldScene {
  const mode = useRuntimeMode();
  const project = useNavigation((state) => state.params.project);
  const template = useNavigation((state) => state.params.template) ?? DEFAULT_TEMPLATE;
  const replaceParams = useNavigation((state) => state.replaceParams);
  const port = usePort(projectsPort);
  const create = useMutation({ mutationFn: port.createProject });
  const mounted = useRef(true);
  const needsProject = mode === "app" && !project;
  const start = useCallback(() => {
    // Only the screen that asked takes the new project; leaving first keeps it in the projects list.
    void create
      .mutateAsync({ template, name: nameOf(template) })
      .then((created) => {
        if (mounted.current) {
          replaceParams({ project: created.id });
        }
      })
      .catch(() => undefined);
  }, [create, template, replaceParams]);
  const asked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (needsProject && !asked.current) {
      asked.current = true;
      start();
    }
    return () => {
      mounted.current = false;
    };
  }, [needsProject, start]);
  if (mode === "prototype") {
    return { kind: "ready", scene: sample };
  }
  if (project) {
    return { kind: "ready", scene: project };
  }
  if (create.isError) {
    return { kind: "failed", reason: create.error.message, retry: start };
  }
  return { kind: "creating" };
}
