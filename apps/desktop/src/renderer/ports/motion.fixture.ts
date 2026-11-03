import type {
  AnimationExport,
  ClipTimeline,
  MotionCompare,
  MotionPort,
  MotionTrainingPlan,
  MotionTrainingStatus,
  PartMatch,
  Pose,
  TrackingProgress,
  VideoSource,
} from "./motion-port.ts";

// Sample clip from the design (a salsa video copied onto an imported dancer), used only by the prototype, the gallery and tests.

const STEP: Pose = {
  head: [30, 6],
  neck: [30, 18],
  hip: [30, 34],
  hands: [
    [14, 20],
    [46, 18],
  ],
  feet: [
    [22, 60],
    [38, 60],
  ],
};
const REACH: Pose = {
  head: [30, 6],
  neck: [30, 18],
  hip: [30, 34],
  hands: [
    [10, 30],
    [50, 8],
  ],
  feet: [
    [18, 58],
    [44, 54],
  ],
};
const TURN: Pose = {
  head: [30, 6],
  neck: [30, 18],
  hip: [30, 34],
  hands: [
    [48, 26],
    [12, 12],
  ],
  feet: [
    [26, 60],
    [42, 58],
  ],
};
const SPIN: Pose = {
  head: [30, 8],
  neck: [30, 18],
  hip: [30, 36],
  hands: [
    [8, 14],
    [52, 14],
  ],
  feet: [
    [16, 56],
    [46, 62],
  ],
};

const CLIP: ClipTimeline = {
  label: "Clip · 12 s · 360 frames",
  weakest: "Low match at 0:07 · spin",
  frames: [STEP, REACH, TURN, SPIN, STEP, REACH, TURN, SPIN, STEP, REACH],
  current: 3,
  match: [0.29, 0.62, 0.71, 0.67, 0.38, 0.33, 0.62, 0.81, 0.76, 0.71, 0.19, 0.48, 0.71, 0.76],
  playhead: 0.31,
  practice: true,
};

const COMPARE: MotionCompare = {
  reference: "Reference · salsa.mp4 · 0:04.2",
  character: "Your dancer · physics on · match 87%",
  speeds: ["0.5×", "1×"],
  speed: "0.5×",
};

const PARTS: PartMatch[] = [
  { id: "legs", name: "Legs", match: 0.93 },
  { id: "hips", name: "Hips", match: 0.9 },
  { id: "arms", name: "Arms", match: 0.86 },
  { id: "balance", name: "Balance in the spin", match: 0.58 },
];

const VIDEO: VideoSource = {
  sources: [
    { id: "file", label: "Upload a file" },
    { id: "link", label: "Paste a link" },
    { id: "webcam", label: "Record with webcam" },
  ],
  source: "file",
  file: { name: "salsa.mp4", facts: "0:12 · 1080p · 30 fps · 2 people found" },
  trim: { from: 0.08, to: 0.88, fromLabel: "0:01.0", toLabel: "0:10.6" },
  people: [
    { id: "left", title: "Person on the left", detail: "In frame the whole clip" },
    { id: "right", title: "Person on the right", detail: "Leaves at 0:08" },
  ],
  person: "left",
  targets: [
    { id: "humanoid", title: "Default humanoid", detail: "1.72 m · ready for physics" },
    { id: "dancer", title: "My character · dancer.glb", detail: "Imported and rigged", imported: true },
  ],
  target: "dancer",
  privacy: "The video stays on your computer. Only the pose is used.",
  poseModel: "Pose model",
  hasVideo: true,
};

const TRACKING: TrackingProgress = {
  file: "salsa.mp4",
  frame: "frame 224 of 360",
  percent: 62,
  state: "running",
  steps: [
    { text: "Find the dancer · person on the left", state: "done" },
    { text: "Track the pose in every frame · 224 / 360", state: "running" },
    { text: "Map the pose onto dancer.glb", state: "todo" },
    { text: "Physics check · can it keep balance?", state: "todo" },
  ],
};

const PLAN: MotionTrainingPlan = {
  title: "Train Dance Copy",
  intro: "8 copies of your dancer practice the clip at once. It learns to keep balance while matching the moves.",
  steps: "3,000,000",
  copies: "8",
  focuses: [
    { id: "weakest", title: "Focus on the spin at 0:07", detail: "It practices the hard part more often" },
    { id: "even", title: "Whole clip evenly", detail: "Same practice for every second" },
  ],
  focus: "weakest",
  estimate: "about 1 h 20 min",
};

const STATUS: MotionTrainingStatus = {
  title: "Training the copy · 34%",
  percent: 34,
  timeLeft: "about 52 min left",
  match: "87% → 91%",
  hardMoment: "Spin at 0:07",
  hardResult: "keeps balance 6 of 10",
};

const EXPORT: AnimationExport = {
  formats: ["glTF", "FBX", "BVH"],
  format: "glTF",
  options: [
    { id: "physics", label: "Use the physics result, not the raw video pose", on: true },
    { id: "root", label: "Include root motion", on: true },
    { id: "loop", label: "Loop the clip", on: false },
  ],
  target: "Roblox · R15 rig · 30 fps",
  summary: ["salsa-physics.glb · 360 frames · 2.4 MB", "19 bones · match 91%"],
};

// In-memory clip that behaves: choices choose, frames select, export options toggle.
export function createMotionFixture(): MotionPort {
  let compare = COMPARE;
  let clip = CLIP;
  let video = VIDEO;
  let plan = PLAN;
  let exported = EXPORT;
  return {
    getCompare: async () => compare,
    setSpeed: async ({ speed }) => {
      compare = { ...compare, speed };
      return compare;
    },
    getClip: async () => clip,
    selectFrame: async ({ index }) => {
      clip = { ...clip, current: index, playhead: (index + 0.5) / clip.frames.length };
      return clip;
    },
    getPartMatch: async () => PARTS,
    getVideoSource: async () => video,
    addVideo: async ({ video: picked }) => {
      video = { ...video, file: { ...video.file, name: picked.name }, hasVideo: true };
      return video;
    },
    setVideoChoice: async ({ field, id }) => {
      video = { ...video, [field]: id };
      return video;
    },
    trackMotion: async () => undefined,
    getTracking: async () => TRACKING,
    getTrainingPlan: async () => plan,
    setTrainingFocus: async ({ focus }) => {
      plan = { ...plan, focus };
      return plan;
    },
    startTraining: async () => undefined,
    getTrainingStatus: async () => STATUS,
    trainWeakestMoment: async () => undefined,
    getExport: async () => exported,
    setExportFormat: async ({ format }) => {
      exported = { ...exported, format };
      return exported;
    },
    toggleExportOption: async ({ id }) => {
      exported = {
        ...exported,
        options: exported.options.map((item) => (item.id === id ? { ...item, on: !item.on } : item)),
      };
      return exported;
    },
    downloadAnimation: async () => ({
      name: "salsa-physics.json",
      mediaType: "application/json",
      content: JSON.stringify({ format: "icarus-motion", name: "salsa.mp4", frames: [] }),
    }),
  };
}
