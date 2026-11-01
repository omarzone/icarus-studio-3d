import { Act } from "../../../app/navigation/go-to.tsx";
import type { RigCheck } from "../../../ports/body-port.ts";

// Preset poses to apply to the body in the view.
export function PoseChips({ poses, onPose }: { poses: RigCheck["poses"]; onPose: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {poses.map((pose) => (
        <Act
          key={pose.id}
          cta={pose.label}
          onClick={() => onPose(pose.id)}
          className="inline-flex h-6.5 items-center rounded-full bg-fill-hover px-2.5 text-ui text-fg-tool hover:bg-control-raised hover:text-fg active:opacity-80"
        >
          {pose.label}
        </Act>
      ))}
    </div>
  );
}
