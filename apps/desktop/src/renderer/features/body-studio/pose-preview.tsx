import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act } from "../../app/navigation/go-to.tsx";
import { ScenePreview } from "../../editor/viewport/scene-preview.tsx";
import type { PosePreview } from "../../ports/body-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { CheckLine } from "../copilot/chat-messages.tsx";

export const poseKey = (body: string) => ["body", body, "pose"] as const;

// The last test pose, kept with the body's queries until the person goes back to editing.
export function usePosePreview(body: string) {
  return useQuery<PosePreview | null>({ queryKey: poseKey(body), queryFn: () => null, enabled: false });
}

// Over the view: the body as MuJoCo left it after holding the pose, with what it found; the project never changes.
export function PosePreviewOverlay({ body }: { body: string }) {
  const client = useQueryClient();
  const pose = usePosePreview(body).data;
  if (!pose) {
    return null;
  }
  return (
    <div className="absolute inset-0 bg-app">
      {pose.scene ? <ScenePreview description={pose.scene} /> : null}
      <div className="absolute top-4 left-4 flex max-w-90 flex-col gap-1.5 rounded-card border border-line-divider bg-floating px-3.5 py-3 shadow-floating">
        <span className="font-semibold">Test pose · {pose.label}</span>
        {pose.facts.map((fact) => (
          <CheckLine key={fact.text} item={fact} />
        ))}
        <Act
          cta="Back to editing"
          onClick={() => client.setQueryData(poseKey(body), null)}
          className={buttonClass("secondary", "mt-1 self-start")}
        >
          Back to editing
        </Act>
      </div>
    </div>
  );
}
