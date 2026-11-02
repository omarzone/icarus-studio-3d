import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePort } from "../app/runtime/port.tsx";
import { type Inspection, type SceneTree, scenePort } from "../ports/scene-port.ts";

// Query keys and reads of the project document, shared by the explorer, the inspector and the viewport.
export const sceneKeys = {
  tree: (scene: string) => ["scene", scene, "tree"] as const,
  inspection: (scene: string) => ["scene", scene, "inspection"] as const,
  copies: (scene: string) => ["scene", scene, "copies"] as const,
  guide: (scene: string) => ["scene", scene, "guide"] as const,
  description: (scene: string) => ["scene", scene, "description"] as const,
  componentKinds: ["scene", "component-kinds"] as const,
  reference: ["scene", "property-reference"] as const,
};

export function useSceneTree(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.tree(scene), queryFn: () => port.getTree(scene) });
}

export function useInspection(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.inspection(scene), queryFn: () => port.getInspection(scene) });
}

export function useGuide(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.guide(scene), queryFn: () => port.getGuide(scene) });
}

export function useSceneDescription(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.description(scene), queryFn: () => port.getSceneDescription(scene) });
}

// Writes what an edit returned into the cache so every panel shows it at once.
export function useSceneCache(scene: string) {
  const client = useQueryClient();
  return {
    tree: (tree: SceneTree) => {
      client.setQueryData(sceneKeys.tree(scene), tree);
      void client.invalidateQueries({ queryKey: sceneKeys.inspection(scene) });
    },
    // Everything else about the scene (tree, guide, viewport) and the project's history is re-read.
    inspection: (inspection: Inspection) => {
      client.setQueryData(sceneKeys.inspection(scene), inspection);
      void client.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] === "scene" && query.queryKey[1] === scene && query.queryKey[2] !== "inspection") ||
          query.queryKey[0] === "projects" ||
          query.queryKey[0] === "revisions",
      });
    },
  };
}
