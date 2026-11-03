// TAB-SIDE-BY-SIDE
import type { MotionCompare } from "../../../ports/motion-port.ts";
import { MotionView } from "./motion-view.tsx";

// The reference video with its tracked skeleton next to the physics character and its match.
export function SideBySideTab({ compare }: { compare: MotionCompare }) {
  return (
    <div className="flex h-full gap-2 p-2">
      <MotionView
        label="Reference video with the tracked skeleton"
        caption={compare.reference}
        playback={compare.playback}
        figures={["reference"]}
        speed={compare.speed}
      />
      <MotionView
        label="The character copying the pose in physics"
        caption={compare.character}
        playback={compare.playback}
        figures={["result"]}
        speed={compare.speed}
      />
    </div>
  );
}
