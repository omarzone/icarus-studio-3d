import { useQueryClient } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { sceneKeys } from "../../editor/scene-queries.ts";
import { copilotPort } from "../../ports/copilot-port.ts";
import { scenePort } from "../../ports/scene-port.ts";
import { captureSceneViews } from "./scene-views.ts";

// Renders the open project's scene and uploads the pictures as "view" attachments; their ids go with the message.
// A scene that cannot be drawn or uploaded never holds the message back: it goes without views.
export function useSceneLook(project: string): () => Promise<string[]> {
  const client = useQueryClient();
  const scenes = usePort(scenePort);
  const copilot = usePort(copilotPort);
  return async () => {
    try {
      const description = await client.fetchQuery({
        queryKey: sceneKeys.description(project),
        queryFn: () => scenes.getSceneDescription(project),
      });
      if (!description) {
        return [];
      }
      const shots = await captureSceneViews(description);
      const uploaded = await Promise.all(
        shots.map((shot) =>
          copilot.attachFile({ key: project, kind: "view", name: shot.name, mediaType: "image/jpeg", data: shot.data }),
        ),
      );
      return uploaded.map((view) => view.id);
    } catch {
      return [];
    }
  };
}
