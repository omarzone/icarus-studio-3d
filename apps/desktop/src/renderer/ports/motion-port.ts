import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createMotionFixture } from "./motion.fixture.ts";
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

export type MotionCompare = {
  reference: string;
  character: string;
  speeds: readonly string[];
  speed: string;
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
};

export type PartMatch = { id: string; name: string; match: number };

export type Option = {
  id: string;
  title: string;
  detail: string;
  // An imported character: choosing it goes through the import to pick or replace the file.
  imported?: boolean;
};
export type VideoSource = {
  sources: readonly { id: string; label: string }[];
  source: string;
  file: { name: string; facts: string };
  trim: { from: number; to: number; fromLabel: string; toLabel: string };
  people: readonly Option[];
  person: string;
  targets: readonly Option[];
  target: string;
  privacy: string;
};

export type TrackingProgress = { file: string; frame: string; percent: number; steps: readonly ProgressStep[] };

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

export type AnimationExport = {
  formats: readonly string[];
  format: string;
  options: readonly { id: string; label: string; on: boolean }[];
  target: string;
  summary: readonly string[];
};

export type MotionPort = {
  getCompare: (clip: string) => Promise<MotionCompare>;
  setSpeed: (input: { clip: string; speed: string }) => Promise<MotionCompare>;
  getClip: (clip: string) => Promise<ClipTimeline>;
  selectFrame: (input: { clip: string; index: number }) => Promise<ClipTimeline>;
  getPartMatch: (clip: string) => Promise<PartMatch[]>;
  getVideoSource: (clip: string) => Promise<VideoSource>;
  setVideoChoice: (input: { clip: string; field: "source" | "person" | "target"; id: string }) => Promise<VideoSource>;
  trackMotion: (clip: string) => Promise<void>;
  getTracking: (clip: string) => Promise<TrackingProgress>;
  getTrainingPlan: (clip: string) => Promise<MotionTrainingPlan>;
  setTrainingFocus: (input: { clip: string; focus: string }) => Promise<MotionTrainingPlan>;
  startTraining: (clip: string) => Promise<void>;
  getTrainingStatus: (clip: string) => Promise<MotionTrainingStatus>;
  trainWeakestMoment: (clip: string) => Promise<void>;
  getExport: (clip: string) => Promise<AnimationExport>;
  setExportFormat: (input: { clip: string; format: string }) => Promise<AnimationExport>;
  toggleExportOption: (input: { clip: string; id: string }) => Promise<AnimationExport>;
  downloadAnimation: (clip: string) => Promise<void>;
};

const workspace = ["SCR-MOTION", "STA-MOTION-TRAINING"] as const;

export const motionPort = definePort<MotionPort>({
  app: {
    getCompare: pending({
      key: "motion.compare",
      summary: "The reference and the physics copy side by side",
      sprint: 10,
      ids: [...workspace],
    }),
    setSpeed: pending({
      key: "motion.setSpeed",
      summary: "Changing the playback speed",
      sprint: 10,
      ids: [...workspace],
    }),
    getClip: pending({
      key: "motion.clip",
      summary: "The clip frames and match curve",
      sprint: 10,
      ids: [...workspace],
    }),
    selectFrame: pending({ key: "motion.selectFrame", summary: "Moving to a frame", sprint: 10, ids: [...workspace] }),
    getPartMatch: pending({
      key: "motion.partMatch",
      summary: "Match per body part",
      sprint: 10,
      ids: ["SCR-MOTION"],
    }),
    getVideoSource: pending({
      key: "motion.videoSource",
      summary: "Reading the reference video",
      sprint: 10,
      ids: ["MOD-MOTION-VIDEO"],
    }),
    setVideoChoice: pending({
      key: "motion.setVideoChoice",
      summary: "Choosing who to copy and onto what",
      sprint: 10,
      ids: ["MOD-MOTION-VIDEO"],
    }),
    trackMotion: pending({
      key: "motion.track",
      summary: "Tracking the motion in the video",
      sprint: 10,
      ids: ["MOD-MOTION-VIDEO"],
    }),
    getTracking: pending({
      key: "motion.tracking",
      summary: "Pose tracking progress",
      sprint: 10,
      ids: ["MOD-MOTION-TRACKING"],
    }),
    getTrainingPlan: pending({
      key: "motion.trainingPlan",
      summary: "The training plan for the copy",
      sprint: 10,
      ids: ["MOD-MOTION-TRAIN"],
    }),
    setTrainingFocus: pending({
      key: "motion.setTrainingFocus",
      summary: "Choosing what the copy practices",
      sprint: 10,
      ids: ["MOD-MOTION-TRAIN"],
    }),
    startTraining: pending({
      key: "motion.startTraining",
      summary: "Training the copy",
      sprint: 10,
      ids: ["MOD-MOTION-TRAIN"],
    }),
    getTrainingStatus: pending({
      key: "motion.trainingStatus",
      summary: "How the copy is training",
      sprint: 10,
      ids: ["STA-MOTION-TRAINING"],
    }),
    trainWeakestMoment: pending({
      key: "motion.trainWeakest",
      summary: "Training the weakest moment",
      sprint: 10,
      ids: ["SCR-MOTION"],
    }),
    getExport: pending({
      key: "motion.export",
      summary: "The animation export settings",
      sprint: 10,
      ids: ["MOD-EXPORT-ANIMATION"],
    }),
    setExportFormat: pending({
      key: "motion.setExportFormat",
      summary: "Choosing the animation format",
      sprint: 10,
      ids: ["MOD-EXPORT-ANIMATION"],
    }),
    toggleExportOption: pending({
      key: "motion.toggleExportOption",
      summary: "Changing an export option",
      sprint: 10,
      ids: ["MOD-EXPORT-ANIMATION"],
    }),
    downloadAnimation: pending({
      key: "motion.download",
      summary: "Downloading the animation",
      sprint: 10,
      ids: ["MOD-EXPORT-ANIMATION"],
    }),
  },
  prototype: createMotionFixture,
});
