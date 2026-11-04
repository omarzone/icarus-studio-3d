import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { motionApi } from "../engine-client/motion-api.ts";
import { createMotionFixture } from "./motion.fixture.ts";
import { createEngineMotionPort } from "./motion-engine.ts";
import type { ProgressStep } from "./progress-step.ts";

// View types of the motion workspace: a reference video, its tracked pose, the physics copy and its export.

export type Point = readonly [number, number];
// A tracked pose in a 60 × 70 box: head, shoulders, hips, then hands and feet (left, right).
export type Pose = {
  head: Point;
  neck: Point;
  hip: Point;
  hands: readonly [Point, Point];
  feet: readonly [Point, Point];
};

// Stick figures to play side by side: the tracked reference and the physics result, at the clip's rate.
export type MotionPlayback = {
  fps: number;
  reference: readonly Pose[];
  result: readonly Pose[];
  // The clip's own frames and keypoints, to show the reference over the real video; null when the engine has none.
  strip: FrameStrip | null;
  points: readonly (readonly FramePoint[])[];
};

export type MotionCompare = {
  reference: string;
  character: string;
  speeds: readonly string[];
  speed: string;
  // None until the clip is tracked (and in the prototype, which draws plain surfaces).
  playback?: MotionPlayback;
};

export type ClipTimeline = {
  label: string;
  weakest: string;
  frames: readonly Pose[];
  current: number;
  // Match score along the clip, 0 to 1, evenly spaced in time.
  match: readonly number[];
  // Playhead position as a share of the clip.
  playhead: number;
  // Whether the weakest moment can be practiced again: a trained copy exists.
  practice?: boolean;
};

export type PartMatch = { id: string; name: string; match: number };

export type Option = {
  id: string;
  title: string;
  detail: string;
  // An imported character: choosing it goes through the import to pick or replace the file.
  imported?: boolean;
};
// The sampled frames of the clip as the engine keeps them: how many, their rate and where each picture is served.
export type FrameStrip = { count: number; fps: number; url: (index: number) => string };

// A tracked keypoint as a share of the picture's width and height.
export type FramePoint = { name: string; x: number; y: number };

export type VideoSource = {
  sources: readonly { id: string; label: string }[];
  source: string;
  file: { name: string; facts: string };
  trim: { from: number; to: number; fromLabel: string; toLabel: string };
  // Seconds of the whole video, where the sampled part starts and how long that part can be.
  duration: number;
  start: number;
  span: number;
  // None before a video is chosen, and in the prototype.
  strip: FrameStrip | null;
  people: readonly Option[];
  person: string;
  targets: readonly Option[];
  target: string;
  privacy: string;
  // The connected pose model, null when none is connected; the prototype assumes one.
  poseModel: string | null;
  hasVideo: boolean;
};

// A video the app sampled into still frames at an even rate, base64 JPEG.
export type SampledVideo = {
  name: string;
  duration: number;
  // Where in the video the frames start, in seconds.
  start: number;
  fps: number;
  width: number;
  height: number;
  frames: readonly string[];
};

export type TrackingProgress = {
  file: string;
  frame: string;
  percent: number;
  steps: readonly ProgressStep[];
  state: "idle" | "running" | "done" | "failed" | "stopped";
  message?: string;
  strip: FrameStrip | null;
  // The frame the pose model reads now, or the last one it read.
  current: number;
  // Once tracked: the copied person's keypoints in every frame, to draw over the pictures.
  poses: readonly (readonly FramePoint[])[];
};

export type MotionTrainingPlan = {
  title: string;
  intro: string;
  steps: string;
  copies: string;
  focuses: readonly Option[];
  focus: string;
  estimate: string;
};

export type MotionTrainingStatus = {
  title: string;
  percent: number;
  timeLeft: string;
  match: string;
  hardMoment: string;
  hardResult: string;
};

export type AnimationFile = { name: string; mediaType: string; content: string };

export type AnimationExport = {
  formats: readonly string[];
  format: string;
  options: readonly { id: string; label: string; on: boolean }[];
  // A named target rig; the engine exports to any tool and takes none, so the app leaves it null.
  target: string | null;
  summary: readonly string[];
};

export type MotionPort = {
  getCompare: (clip: string) => Promise<MotionCompare>;
  setSpeed: (input: { clip: string; speed: string }) => Promise<MotionCompare>;
  getClip: (clip: string) => Promise<ClipTimeline>;
  selectFrame: (input: { clip: string; index: number }) => Promise<ClipTimeline>;
  getPartMatch: (clip: string) => Promise<PartMatch[]>;
  getVideoSource: (clip: string) => Promise<VideoSource>;
  addVideo: (input: { clip: string; video: SampledVideo }) => Promise<VideoSource>;
  setVideoChoice: (input: { clip: string; field: "source" | "person" | "target"; id: string }) => Promise<VideoSource>;
  trackMotion: (clip: string) => Promise<void>;
  getTracking: (clip: string) => Promise<TrackingProgress>;
  getTrainingPlan: (clip: string) => Promise<MotionTrainingPlan>;
  setTrainingFocus: (input: { clip: string; focus: string }) => Promise<MotionTrainingPlan>;
  startTraining: (input: { clip: string; steps: string; copies: string }) => Promise<void>;
  getTrainingStatus: (clip: string) => Promise<MotionTrainingStatus>;
  trainWeakestMoment: (clip: string) => Promise<void>;
  getExport: (clip: string) => Promise<AnimationExport>;
  setExportFormat: (input: { clip: string; format: string }) => Promise<AnimationExport>;
  toggleExportOption: (input: { clip: string; id: string }) => Promise<AnimationExport>;
  downloadAnimation: (clip: string) => Promise<AnimationFile>;
};

export const motionPort = definePort<MotionPort>({
  app: createEngineMotionPort(engineApi, motionApi),
  prototype: createMotionFixture,
});
