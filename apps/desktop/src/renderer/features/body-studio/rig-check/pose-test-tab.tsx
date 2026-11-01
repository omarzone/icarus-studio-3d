// TAB-POSE-TEST
import type { RigCheck } from "../../../ports/body-port.ts";
import { PoseChips } from "./pose-chips.tsx";

// Preset poses (T-pose, A-pose, a frame from the video) to feel the joint limits.
export function PoseTestTab({ check, onPose }: { check: RigCheck; onPose: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3">
      <span className="text-ui text-fg-secondary">{check.poseHint}</span>
      <PoseChips poses={check.poses} onPose={onPose} />
    </div>
  );
}
