// TAB-OVERLAY
import type { MotionCompare } from "../../../ports/motion-port.ts";
import { MotionView } from "./motion-view.tsx";

// The physics character drawn over the reference video.
export function OverlayTab({ compare }: { compare: MotionCompare }) {
  return (
    <div className="flex h-full p-2">
      <MotionView label="The character drawn over the reference video" caption={compare.character} />
    </div>
  );
}
