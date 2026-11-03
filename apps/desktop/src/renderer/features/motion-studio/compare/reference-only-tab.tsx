// TAB-REFERENCE-ONLY
import type { MotionCompare } from "../../../ports/motion-port.ts";
import { MotionView } from "./motion-view.tsx";

// Only the reference video and its tracked skeleton.
export function ReferenceOnlyTab({ compare }: { compare: MotionCompare }) {
  return (
    <div className="flex h-full p-2">
      <MotionView
        label="Reference video with the tracked skeleton"
        caption={compare.reference}
        playback={compare.playback}
        figures={["reference"]}
        speed={compare.speed}
      />
    </div>
  );
}
