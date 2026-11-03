import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePort } from "../app/runtime/port.tsx";
import { type Inspection, type SceneTree, scenePort } from "../ports/scene-port.ts";

// Query keys and reads of the project document, shared by the explorer, the inspector and the viewport.
export const sceneKeys = {
  tree: (scene: string) => ["scene", scene, "tree"] as const,
  inspection: (scene: string) => ["scene", scene, "inspection"] as const,
  brainSettings: (scene: string) => ["scene", scene, "brain-settings"] as const,
  copies: (scene: string) => ["scene", scene, "copies"] as const,
  copyScenes: (scene: string) => ["scene", scene, "copy-scenes"] as const,
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

export function useBrainSettings(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.brainSettings(scene), queryFn: () => port.getBrainSettings(scene) });
}

export function useGuide(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.guide(scene), queryFn: () => port.getGuide(scene) });
}

export function useSceneDescription(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.description(scene), queryFn: () => port.getSceneDescription(scene) });
}

// Each training copy's first episode; re-read after every edit like the rest of the scene.
export function useCopyScenes(scene: string) {
  const port = usePort(scenePort);
  return useQuery({ queryKey: sceneKeys.copyScenes(scene), queryFn: () => port.getCopyScenes({ scene }) });
}

// Writes what an edit returned into the cache so every panel shows it at once.
export function useSceneCache(scene: string) {
  const client = useQueryClient();
  // Everything else about the scene (tree, guide, viewport) and the project's history is re-read.
  const refreshOthers = (kept: string) =>
    client.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] === "scene" && query.queryKey[1] === scene && query.queryKey[2] !== kept) ||
        query.queryKey[0] === "projects" ||
        query.queryKey[0] === "revisions",
    });
  return {
    tree: (tree: SceneTree) => {
      client.setQueryData(sceneKeys.tree(scene), tree);
      void client.invalidateQueries({ queryKey: sceneKeys.inspection(scene) });
    },
    // An edit of whole objects (rename, duplicate, delete, reparent): the tree it returned, everything else re-read.
    objects: (tree: SceneTree) => {
      client.setQueryData(sceneKeys.tree(scene), tree);
      void refreshOthers("tree");
    },
    inspection: (inspection: Inspection) => {
      client.setQueryData(sceneKeys.inspection(scene), inspection);
      void refreshOthers("inspection");
    },
    brainSettings: (settings: Inspection) => {
      client.setQueryData(sceneKeys.brainSettings(scene), settings);
      void refreshOthers("brain-settings");
    },
    // An accepted copilot value also changes the proposal the chat shows.
    accepted: (kept: "inspection" | "brain-settings", inspection: Inspection) => {
      client.setQueryData(["scene", scene, kept], inspection);
      void refreshOthers(kept);
      void client.invalidateQueries({ queryKey: ["copilot"] });
      void client.invalidateQueries({ queryKey: ["copilot-preview"] });
    },
  };
}
