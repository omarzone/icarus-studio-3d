export type Box = { x: number; y: number; w: number; h: number };
export type Panel = { tabs: string[]; box: Box };

// Tab labels of a panel, joined by " | ", to the catalog module ID (docs/design/screens.md › Modules and tabs).
const STRIP: Record<string, string> = {
  Explorer: "PNL-EXPLORER",
  Rig: "PNL-EXPLORER",
  Clip: "PNL-EXPLORER",
  Properties: "PNL-INSPECTOR",
  "Chat | History": "PNL-CHAT",
  "Scene | Game view": "PNL-VIEWPORT",
  "Rig | Mesh": "PNL-VIEWPORT",
  "Live training | Replay": "PNL-VIEWPORT",
  "Network | Scene": "PNL-VIEWPORT",
  "Play | Game view": "PNL-VIEWPORT",
  "Play | Agent view": "PNL-VIEWPORT",
  "Ideas | Scene": "PNL-IDEAS",
  "Library | Community | My files": "PNL-LIBRARY",
  "Rig check | Pose test | Weights": "PNL-RIG-CHECK",
  "What it sees | What it can do": "PNL-SENSES-ACTIONS",
  "Reward | Goal | Curriculum": "PNL-LEARNING",
  Shape: "PNL-BRAIN-SHAPE",
  "Brain activity | Behaviors | Wiring": "PNL-BRAIN-ACTIVITY",
  "Brain activity": "PNL-BRAIN-ACTIVITY",
  Runs: "PNL-RUNS",
  "Metrics | Console": "PNL-METRICS",
  "Runs | Best brains": "PNL-RESULT-RUNS",
  "Summary | Notes": "PNL-SUMMARY",
  "Compare | Where it fails | Timelapse": "PNL-RESULTS-VIEW",
  "How it learned": "PNL-LEARNED",
  "Failures | All test runs": "PNL-FAILURES",
  "Side by side | Overlay | Reference only": "PNL-MOTION-COMPARE",
  "Clip · 12 s · 360 frames | Match score": "PNL-CLIP-TIMELINE",
  Build: "PNL-BUILD-TARGETS",
  "Share to community": "PNL-BUILD-TARGET-VIEW",
  "What it senses": "PNL-PLAY-SENSES",
  "What it decides": "PNL-PLAY-DECISIONS",
  Vision: "PNL-PLAY-VISION",
  "What happened": "PNL-PLAY-EVENTS",
  "Behavior tests | Recordings": "PNL-REFERENCE-TESTS",
  "Open arena walk | Looming shadow | Grooming": "PNL-REFERENCE-VIEW",
  "Behavior match | Neurons": "PNL-REFERENCE-MATCH",
};

export function moduleRegions(panels: Panel[]): Record<string, Box> {
  const regions: Record<string, Box> = {};
  for (const panel of panels) {
    const id = STRIP[panel.tabs.filter((tab) => tab !== "+").join(" | ")];
    if (id && !(id in regions)) {
      regions[id] = panel.box;
    }
  }
  return regions;
}
