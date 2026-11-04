import type { Keypoint, MotionComparison, MotionWorkspace, RunStatus } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { anglePose } from "./motion-poses.ts";
import {
  animationExport,
  clipTimeline,
  motionCompare,
  partMatches,
  trackingProgress,
  trainingPlan,
  trainingStatus,
  videoSource,
} from "./motion-views.ts";

const STANDING: Keypoint[] = [
  { name: "head", x: 0.5, y: 0.1 },
  { name: "neck", x: 0.5, y: 0.2 },
  { name: "left_hip", x: 0.48, y: 0.5 },
  { name: "right_hip", x: 0.52, y: 0.5 },
  { name: "left_wrist", x: 0.45, y: 0.45 },
  { name: "left_ankle", x: 0.48, y: 0.9 },
  { name: "right_ankle", x: 0.52, y: 0.9 },
];

const COMPARISON: MotionComparison = {
  clip: "c1",
  run_id: "r1",
  run_name: "Run 2",
  step: 250_000,
  fps: 2,
  segments: ["left_thigh"],
  reference: [[-1.57], [-1.2], [-1.57], [-1.57]],
  result: [[-1.57], [-1.5], [null], [null]],
  match: [1, 0.8, 0, 0],
  parts: [{ segment: "left_thigh", part: "thigh_left", match: 0.45 }],
  overall: 0.45,
  weakest: 0.5,
};

function workspace(change: Partial<MotionWorkspace> = {}): MotionWorkspace {
  return {
    clip: {
      id: "c1",
      created_at: "2026-11-03T00:00:00Z",
      video: { name: "walk.mp4", duration: 2, start: 0, fps: 2, width: 640, height: 480, frames: 4 },
      person: "largest",
      target: "humanoid_body",
      view: "side",
      people: 2,
      frames: [0, 1, 2, 3].map((index) => ({ time: index / 2, keypoints: index === 3 ? [] : STANDING })),
    },
    tracking: null,
    pose_model: "pose-model",
    reference: null,
    comparison: null,
    ...change,
  };
}

describe("the motion workspace from the engine", () => {
  it("shows the frame being tracked, then every frame with the copied person once tracking is done", () => {
    const link = (index: number) => `http://engine/frames/${index}`;
    const running = trackingProgress(
      workspace({
        tracking: { clip: "c1", state: "running", frame: 2, frames: 4, model: "pose-model", message: null },
      }),
      link,
    );
    expect([running.current, running.strip?.url(running.current), running.poses]).toEqual([
      2,
      "http://engine/frames/2",
      [],
    ]);
    const done = trackingProgress(workspace(), link);
    expect([done.state, done.strip?.count, done.strip?.fps, done.poses.length]).toEqual(["done", 4, 2, 4]);
    expect(done.poses[0]?.find((point) => point.name === "head")).toEqual({ name: "head", x: 0.5, y: 0.1 });
    expect(trackingProgress(workspace()).strip).toBeNull();
    expect(videoSource(workspace({ clip: null }), null, link).strip).toBeNull();
  });

  it("draws tracked frames as stick figures in their box and says what is missing", () => {
    const timeline = clipTimeline(workspace(), 1);
    expect(timeline.label).toBe("Clip · 2.0 s · 4 frames");
    expect(timeline.weakest).toBe("Not trained yet");
    expect(timeline.frames).toHaveLength(4);
    const [first] = timeline.frames;
    expect(first?.head[1]).toBeLessThan(first?.hip[1] ?? 0);
    expect(timeline.match).toEqual([]);
    expect(timeline.practice).toBe(false);
  });

  it("reads the match curve, the weakest moment and each limb from the latest comparison", () => {
    const trained = workspace({ comparison: COMPARISON });
    expect(clipTimeline(trained, 0).weakest).toBe("Low match at 0:01.0");
    expect(clipTimeline(trained, 0).practice).toBe(true);
    expect(partMatches(trained)).toEqual([{ id: "left_thigh", name: "Left thigh", match: 0.45 }]);
    const compare = motionCompare(trained, "0.5×");
    expect(compare.character).toBe("Run 2 · step 250,000 · match 45%");
    expect(compare.playback?.result).toHaveLength(4);
  });

  it("plays the reference over the clip's own frames once it is tracked", () => {
    const compare = motionCompare(workspace(), "1×", (index) => `http://engine/frames/${index}`);
    expect([compare.playback?.strip?.count, compare.playback?.points.length]).toEqual([4, 4]);
    expect(motionCompare(workspace(), "1×").playback?.strip).toBeNull();
  });

  it("turns limb angles into a figure: a thigh swung forward puts the foot ahead of the hip", () => {
    const pose = anglePose(["left_thigh", "left_shin"], [-0.8, -1.2]);
    expect(pose.feet[0][0]).toBeGreaterThan(pose.hip[0]);
    expect(pose.feet[1][0]).toBe(pose.hip[0]);
  });

  it("says to connect a pose model when none is connected", () => {
    const source = videoSource(workspace({ pose_model: null }), null);
    expect(source.poseModel).toBeNull();
    expect(source.privacy).toContain("Connect a pose model");
    expect(source.file.facts).toContain("2 people found");
    expect(source.targets.at(-1)?.imported).toBe(true);
  });

  it("follows tracking frame by frame and keeps why it failed", () => {
    const running = trackingProgress(
      workspace({ tracking: { clip: "c1", state: "running", frame: 1, frames: 4, model: "pose-model" } }),
    );
    expect(running.frame).toBe("frame 1 of 4");
    expect(running.percent).toBe(25);
    expect(running.steps[1]?.state).toBe("running");
    const failed = trackingProgress(
      workspace({ tracking: { clip: "c1", state: "failed", frame: 2, frames: 4, model: "m", message: "Timed out" } }),
    );
    expect(failed.state).toBe("failed");
    expect(failed.message).toBe("Timed out");
  });

  it("offers the weakest moment only once a copy has trained, and never invents an estimate", () => {
    expect(trainingPlan(workspace(), null, "weakest").focuses.map((focus) => focus.id)).toEqual(["even"]);
    const plan = trainingPlan(workspace({ comparison: COMPARISON }), null, "weakest");
    expect(plan.focus).toBe("weakest");
    expect(plan.estimate).toBe("Measured once training starts");
  });

  it("reports training progress from the run and the match from its latest checkpoint", () => {
    const run: RunStatus = {
      run_id: "r1",
      project_id: "p1",
      revision_number: 3,
      name: "Run 2",
      state: "running",
      step: 500_000,
      total_steps: 2_000_000,
      copies: 8,
      steps_per_second: 2500,
      started_at: "2026-11-03T00:00:00Z",
    };
    const status = trainingStatus(run, COMPARISON);
    expect(status.percent).toBe(25);
    expect(status.timeLeft).toBe("about 10 min left");
    expect(status.match).toBe("45%");
    expect(trainingStatus(run, null).match).toBe("not measured yet");
  });

  it("exports the tracked reference until a physics result exists", () => {
    const settings = animationExport(workspace(), { format: "BVH", options: {} });
    expect(settings.options.find((option) => option.id === "physics")?.on).toBe(false);
    expect(settings.summary[0]).toBe("walk-reference.bvh · 4 frames");
    const trained = animationExport(workspace({ comparison: COMPARISON }), { format: "JSON", options: {} });
    expect(trained.summary[0]).toBe("walk-physics.json · 4 frames");
  });
});
