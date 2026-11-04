import type {
  MotionComparison,
  MotionExportFile,
  MotionExportRequest,
  MotionWorkspace,
  Project,
  RunStatus,
} from "@icarus/contracts";
import type {
  AnimationExport,
  AnimationFile,
  ClipTimeline,
  FramePoint,
  FrameStrip,
  MotionCompare,
  MotionTrainingPlan,
  MotionTrainingStatus,
  Option,
  PartMatch,
  Pose,
  TrackingProgress,
  VideoSource,
} from "./motion-port.ts";
import { anglePose, boundsOf, keypointPose } from "./motion-poses.ts";

// Pure maps from the engine's motion workspace onto the motion views, kept apart so they are tested without it.

export const SPEEDS = ["0.5×", "1×"] as const;
export const FORMATS = ["JSON", "BVH", "glTF"] as const;
type ExportFormat = NonNullable<MotionExportRequest["format"]>;
export const TIMELINE_FRAMES = 10;
const CURVE_POINTS = 40;
const RECOMMENDED_STEPS = 2_000_000;

const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  torso: "Torso",
  head: "Head",
  left_upper_arm: "Left upper arm",
  left_forearm: "Left forearm",
  right_upper_arm: "Right upper arm",
  right_forearm: "Right forearm",
  left_thigh: "Left thigh",
  left_shin: "Left shin",
  right_thigh: "Right thigh",
  right_shin: "Right shin",
};

export function clock(seconds: number): string {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${(whole - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

function sampled<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) {
    return [...items];
  }
  return Array.from({ length: count }, (_, index) => items[Math.floor(((index + 0.5) * items.length) / count)] as T);
}

function tracked(workspace: MotionWorkspace) {
  return workspace.clip?.frames ?? [];
}

export function referencePoses(workspace: MotionWorkspace): Pose[] {
  const frames = tracked(workspace).map((frame) => frame.keypoints);
  const bounds = boundsOf(frames);
  return frames.map((keypoints) => keypointPose(keypoints, bounds));
}

function resultPoses(comparison: MotionComparison): Pose[] {
  return comparison.result.map((row) => anglePose(comparison.segments, row));
}

function weakestLabel(workspace: MotionWorkspace): string {
  const { clip, comparison } = workspace;
  if (!clip || tracked(workspace).length === 0) {
    return "Not tracked yet";
  }
  if (!comparison) {
    return "Not trained yet";
  }
  return `Low match at ${clock(comparison.weakest * (comparison.match.length / comparison.fps))}`;
}

export function clipTimeline(workspace: MotionWorkspace, current: number): ClipTimeline {
  const clip = workspace.clip;
  const poses = referencePoses(workspace);
  const frames = sampled(poses, TIMELINE_FRAMES);
  const seconds = clip ? clip.video.frames / clip.video.fps : 0;
  const index = Math.min(Math.max(current, 0), Math.max(frames.length - 1, 0));
  return {
    label: clip ? `Clip · ${seconds.toFixed(1)} s · ${clip.video.frames} frames` : "Clip",
    weakest: weakestLabel(workspace),
    frames,
    current: index,
    match: sampled(workspace.comparison?.match ?? [], CURVE_POINTS),
    playhead: frames.length ? (index + 0.5) / frames.length : 0,
    practice: workspace.comparison !== null,
  };
}

export function motionCompare(workspace: MotionWorkspace, speed: string, link: FrameLink = null): MotionCompare {
  const { clip, comparison } = workspace;
  const reference = referencePoses(workspace);
  const compare: MotionCompare = {
    reference: clip
      ? `Reference · ${clip.video.name} · ${clock(clip.video.frames / clip.video.fps)}`
      : "No reference video yet",
    character: comparison
      ? `${comparison.run_name} · step ${comparison.step.toLocaleString("en-US")} · match ${percent(comparison.overall)}`
      : "Not trained yet",
    speeds: SPEEDS,
    speed,
  };
  if (!clip || reference.length === 0) {
    return compare;
  }
  return {
    ...compare,
    playback: {
      fps: clip.video.fps,
      reference,
      result: comparison ? resultPoses(comparison) : [],
      strip: frameStrip(workspace, link),
      points: framePoints(workspace),
    },
  };
}

export function partMatches(workspace: MotionWorkspace): PartMatch[] {
  return (workspace.comparison?.parts ?? []).map((part) => ({
    id: part.segment,
    name: SEGMENT_LABELS[part.segment] ?? part.segment,
    match: part.match,
  }));
}

const PEOPLE: readonly Option[] = [
  { id: "largest", title: "The largest person", detail: "Whoever fills most of each frame" },
  { id: "left", title: "Person on the left", detail: "The leftmost person in each frame" },
  { id: "right", title: "Person on the right", detail: "The rightmost person in each frame" },
];

type FrameLink = ((index: number) => string) | null;

function framePoints(workspace: MotionWorkspace): FramePoint[][] {
  return tracked(workspace).map((item) => item.keypoints.map(({ name, x, y }) => ({ name, x, y })));
}

function frameStrip(workspace: MotionWorkspace, link: FrameLink): FrameStrip | null {
  const video = workspace.clip?.video;
  return video && link && video.frames > 0 ? { count: video.frames, fps: video.fps, url: link } : null;
}

export function videoSource(workspace: MotionWorkspace, project: Project | null, link: FrameLink = null): VideoSource {
  const clip = workspace.clip;
  const people = clip?.people ? ` · ${clip.people} ${clip.people === 1 ? "person" : "people"} found` : "";
  const covered = clip ? clip.video.frames / clip.video.fps : 0;
  const start = clip?.video.start ?? 0;
  const duration = clip?.video.duration ?? 1;
  const bodies: Option[] = (project?.bodies ?? []).map((body) => ({
    id: body.id,
    title: body.name,
    detail: `${body.objects.length} parts · ready for physics`,
  }));
  const model = workspace.pose_model;
  return {
    sources: [{ id: "file", label: "Upload a file" }],
    source: "file",
    file: clip
      ? {
          name: clip.video.name,
          facts: `${clock(clip.video.duration)} · ${clip.video.width}×${clip.video.height} · ${clip.video.frames} frames at ${clip.video.fps} fps${people}`,
        }
      : { name: "No video chosen", facts: "Choose a video: up to 12 s is sampled at 8 frames a second" },
    trim: {
      from: clip ? start / duration : 0,
      to: clip ? Math.min(1, (start + covered) / duration) : 1,
      fromLabel: clock(start),
      toLabel: clock(start + covered),
    },
    duration: clip?.video.duration ?? 0,
    start,
    span: covered,
    strip: frameStrip(workspace, link),
    people: PEOPLE,
    person: clip?.person ?? "largest",
    targets: [
      ...bodies,
      { id: "import", title: "Import a character", detail: "OBJ, STL, glTF or GLB, auto-rigged", imported: true },
    ],
    target: clip?.target ?? bodies[0]?.id ?? "import",
    privacy: model
      ? `Only the sampled frames go to your pose model (${model}); the video file stays on your computer.`
      : "Connect a pose model in Settings › AI models to track the motion; nothing leaves your computer until then.",
    poseModel: model,
    hasVideo: clip !== null,
  };
}

export function trackingProgress(workspace: MotionWorkspace, link: FrameLink = null): TrackingProgress {
  const clip = workspace.clip;
  const tracking = workspace.tracking;
  const frames = tracking?.frames ?? clip?.video.frames ?? 0;
  const done = tracking?.state === "done" || (tracking === null && tracked(workspace).length > 0);
  const frame = done ? frames : (tracking?.frame ?? 0);
  const running = tracking?.state === "running";
  const progress: TrackingProgress = {
    file: clip?.video.name ?? "the video",
    frame: frames ? `frame ${frame} of ${frames}` : "no frames yet",
    percent: frames ? Math.round((100 * frame) / frames) : 0,
    state: done ? "done" : (tracking?.state ?? "idle"),
    strip: frameStrip(workspace, link),
    current: Math.max(0, Math.min(frame, frames - 1)),
    poses: done ? framePoints(workspace) : [],
    steps: [
      { text: `Sample the video · ${clip?.video.frames ?? 0} frames`, state: clip ? "done" : "todo" },
      {
        text: `Track the pose in every frame · ${frame} / ${frames}${tracking?.model ? ` · ${tracking.model}` : ""}`,
        state: done ? "done" : running ? "running" : "todo",
      },
      {
        text: `Pick the person · ${PEOPLE.find((item) => item.id === clip?.person)?.title.toLowerCase() ?? "the largest person"}`,
        state: done ? "done" : "todo",
      },
    ],
  };
  return tracking?.message ? { ...progress, message: tracking.message } : progress;
}

export function trainingPlan(workspace: MotionWorkspace, project: Project | null, focus: string): MotionTrainingPlan {
  const comparison = workspace.comparison;
  const copies = project?.brain.copies ?? 8;
  const steps = project?.brain.training_steps ?? RECOMMENDED_STEPS;
  const focuses: Option[] = [{ id: "even", title: "Whole clip evenly", detail: "Tries start anywhere in the clip" }];
  if (comparison) {
    const moment = clock(comparison.weakest * (comparison.match.length / comparison.fps));
    focuses.unshift({ id: "weakest", title: `Focus on the moment at ${moment}`, detail: "Half the tries start there" });
  }
  return {
    title: `Train the copy of ${workspace.clip?.video.name ?? "the clip"}`,
    intro: `${copies} copies of your body practice the clip at once, paid for pointing each limb the way the video does while keeping their balance.`,
    steps: steps.toLocaleString("en-US"),
    copies: String(copies),
    focuses,
    focus: focuses.some((item) => item.id === focus) ? focus : "even",
    estimate: "Measured once training starts",
  };
}

export function trainingStatus(run: RunStatus, comparison: MotionComparison | null): MotionTrainingStatus {
  const share = run.total_steps ? run.step / run.total_steps : 0;
  const left = run.steps_per_second > 0 ? (run.total_steps - run.step) / run.steps_per_second : null;
  const moment = comparison ? clock(comparison.weakest * (comparison.match.length / comparison.fps)) : null;
  const worst = comparison
    ? Math.min(...comparison.match.slice(Math.floor(comparison.weakest * comparison.match.length)))
    : null;
  return {
    title: `Training the copy · ${Math.round(share * 100)}%`,
    percent: Math.round(share * 100),
    timeLeft: left === null ? "measuring speed" : `about ${Math.max(1, Math.round(left / 60))} min left`,
    match: comparison ? percent(comparison.overall) : "not measured yet",
    hardMoment: moment ? `Weakest moment ${moment}` : "Weakest moment",
    hardResult: worst !== null && Number.isFinite(worst) ? `match ${percent(worst)}` : "after the first checkpoint",
  };
}

export type ExportChoices = { format: string; options: Readonly<Record<string, boolean>> };

// The engine's name for a format label; anything unknown exports as JSON.
export function exportFormat(label: string): ExportFormat {
  switch (label) {
    case "BVH":
      return "bvh";
    case "glTF":
      return "gltf";
    default:
      return "json";
  }
}

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = { json: "json", bvh: "bvh", gltf: "glb" };

// The engine's file as the app saves it: binary files arrive as base64 and are saved as their bytes.
export function animationFile(file: MotionExportFile): AnimationFile {
  const content =
    file.encoding === "base64" ? Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0)) : file.content;
  return { name: file.name, mediaType: file.media_type, content };
}

export function animationExport(workspace: MotionWorkspace, choices: ExportChoices): AnimationExport {
  const comparison = workspace.comparison;
  const physics = (choices.options.physics ?? true) && comparison !== null;
  const stem = (workspace.clip?.video.name ?? "motion").replace(/\.[^.]+$/, "");
  const extension = EXTENSIONS[exportFormat(choices.format)];
  const frames = workspace.clip?.frames?.length ?? 0;
  return {
    formats: FORMATS,
    format: choices.format,
    options: [
      { id: "physics", label: "Use the physics result, not the raw video pose", on: physics },
      { id: "root", label: "Include root motion", on: choices.options.root ?? true },
      { id: "loop", label: "Loop the clip", on: choices.options.loop ?? false },
    ],
    target: null,
    summary: [
      `${stem}-${physics ? "physics" : "reference"}.${extension} · ${frames} frames`,
      comparison
        ? `${comparison.segments.length} limbs · match ${percent(comparison.overall)}`
        : "No physics result yet: exports the tracked reference",
    ],
  };
}
