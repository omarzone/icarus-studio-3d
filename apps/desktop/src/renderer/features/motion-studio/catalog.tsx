import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ClipTimelinePanel } from "./clip-timeline/clip-timeline-panel.tsx";
import { MotionComparePanel } from "./compare/motion-compare-panel.tsx";
import { ExportDialog } from "./export-dialog.tsx";
import { MotionScreen } from "./motion-screen.tsx";
import { TrackingDialog } from "./tracking-dialog.tsx";
import { TrainDialog } from "./train-dialog.tsx";
import { VideoDialog } from "./video-dialog.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-MOTION", maxDiff: 0.045, component: MotionScreen },
    { id: "STA-MOTION-TRAINING", maxDiff: 0.045, component: MotionScreen },
    {
      id: "MOD-MOTION-VIDEO",
      maxDiff: 0.045,
      over: "STA-WORLD-EMPTY-NOGUIDE",
      params: { draftName: "Dance Copy" },
      component: VideoDialog,
    },
    { id: "MOD-MOTION-TRACKING", maxDiff: 0.045, over: "SCR-MOTION", component: TrackingDialog },
    { id: "MOD-MOTION-TRAIN", maxDiff: 0.045, over: "SCR-MOTION", component: TrainDialog },
    { id: "MOD-EXPORT-ANIMATION", maxDiff: 0.045, over: "SCR-MOTION", component: ExportDialog },
  ],
  modules: [
    {
      id: "PNL-MOTION-COMPARE",
      component: () => (
        <div className="flex h-150 w-200 flex-col p-3">
          <MotionComparePanel clip="dance-copy" />
        </div>
      ),
    },
    {
      id: "PNL-CLIP-TIMELINE",
      component: () => (
        <div className="flex w-200 flex-col p-3">
          <ClipTimelinePanel clip="dance-copy" />
        </div>
      ),
    },
  ],
};
