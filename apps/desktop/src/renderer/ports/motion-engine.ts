import type { MotionChoice, MotionWorkspace } from "@icarus/contracts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import type { MotionApi } from "../engine-client/motion-api.ts";
import type { MotionPort } from "./motion-port.ts";
import {
  animationExport,
  clipTimeline,
  type ExportChoices,
  motionCompare,
  partMatches,
  SPEEDS,
  trackingProgress,
  trainingPlan,
  trainingStatus,
  videoSource,
} from "./motion-views.ts";

type ProjectApi = Pick<EngineApi, "project" | "run">;
type PersonRule = NonNullable<MotionChoice["person"]>;
const PEOPLE: readonly string[] = ["largest", "left", "right"];

function count(text: string, name: string): number | undefined {
  const value = Number(text.replaceAll(/[,\s_]/g, ""));
  if (text.trim() === "") {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a whole number`);
  }
  return value;
}

function isPerson(id: string): id is PersonRule {
  return PEOPLE.includes(id);
}

// The motion workspace on the engine: in the app the clip key is the open project's id. Playback speed, the frame
// looked at, the practice focus and the export choices are view state kept here.
export function createEngineMotionPort(api: ProjectApi, motion: MotionApi): MotionPort {
  const speeds = new Map<string, string>();
  const frames = new Map<string, number>();
  const focuses = new Map<string, string>();
  const exports = new Map<string, ExportChoices>();
  const workspace = (clip: string): Promise<MotionWorkspace> => motion.workspace(clip);
  const project = async (clip: string) => (await api.project(clip)).project;
  const choices = (clip: string): ExportChoices => exports.get(clip) ?? { format: "JSON", options: {} };
  const link = (clip: string, current: MotionWorkspace) =>
    current.clip ? motion.frameLink(clip, current.clip.id) : Promise.resolve(null);
  const source = async (clip: string) => {
    const current = await workspace(clip);
    return videoSource(current, await project(clip), await link(clip, current));
  };
  const compare = async (clip: string) => {
    const current = await workspace(clip);
    return motionCompare(current, speeds.get(clip) ?? "1×", await link(clip, current));
  };
  const plan = async (clip: string) =>
    trainingPlan(await workspace(clip), await project(clip), focuses.get(clip) ?? "even");
  const exported = async (clip: string) => animationExport(await workspace(clip), choices(clip));
  return {
    getCompare: compare,
    setSpeed: async ({ clip, speed }) => {
      speeds.set(clip, SPEEDS.find((item) => item === speed) ?? "1×");
      return compare(clip);
    },
    getClip: async (clip) => clipTimeline(await workspace(clip), frames.get(clip) ?? 0),
    selectFrame: async ({ clip, index }) => {
      frames.set(clip, index);
      return clipTimeline(await workspace(clip), index);
    },
    getPartMatch: async (clip) => partMatches(await workspace(clip)),
    getVideoSource: source,
    addVideo: async ({ clip, video }) => {
      const [first, second, ...rest] = video.frames;
      if (first === undefined || second === undefined) {
        throw new Error("The video is too short to copy: it needs at least two frames");
      }
      await motion.addVideo(clip, {
        name: video.name,
        duration: video.duration,
        start: video.start,
        fps: video.fps,
        width: video.width,
        height: video.height,
        frames: [first, second, ...rest],
      });
      return source(clip);
    },
    setVideoChoice: async ({ clip, field, id }) => {
      if (field === "person" && isPerson(id)) {
        await motion.choose(clip, { person: id });
      } else if (field === "target" && id !== "import") {
        await motion.choose(clip, { target: id });
      }
      return source(clip);
    },
    trackMotion: async (clip) => {
      const current = await workspace(clip);
      if (!current.clip) {
        throw new Error("Choose a video first");
      }
      if (!current.pose_model) {
        throw new Error("Connect a pose model in Settings › AI models to track the motion");
      }
      await motion.track(clip);
    },
    getTracking: async (clip) => {
      const current = await workspace(clip);
      return trackingProgress(current, await link(clip, current));
    },
    getTrainingPlan: plan,
    setTrainingFocus: async ({ clip, focus }) => {
      focuses.set(clip, focus);
      return plan(clip);
    },
    startTraining: async ({ clip, steps, copies }) => {
      const focus = focuses.get(clip) === "weakest" ? "weakest" : "even";
      await motion.train(clip, {
        focus,
        total_steps: count(steps, "Practice steps") ?? null,
        copies: count(copies, "Parallel copies") ?? null,
      });
    },
    getTrainingStatus: async (clip) => {
      const current = await workspace(clip);
      if (!current.run_id) {
        throw new Error("The copy is not training: start training from Train copy");
      }
      return trainingStatus(await api.run(current.run_id), current.comparison);
    },
    trainWeakestMoment: async (clip) => {
      const current = await workspace(clip);
      if (!current.comparison) {
        throw new Error("Train the copy once first: the weakest moment comes from its latest checkpoint");
      }
      await motion.train(clip, { focus: "weakest", warm: true });
    },
    getExport: exported,
    setExportFormat: async ({ clip, format }) => {
      exports.set(clip, { ...choices(clip), format: format === "BVH" ? "BVH" : "JSON" });
      return exported(clip);
    },
    toggleExportOption: async ({ clip, id }) => {
      const current = await exported(clip);
      const on = current.options.find((option) => option.id === id)?.on ?? false;
      exports.set(clip, { ...choices(clip), options: { ...choices(clip).options, [id]: !on } });
      return exported(clip);
    },
    downloadAnimation: async (clip) => {
      const settings = await exported(clip);
      const option = (id: string) => settings.options.find((item) => item.id === id)?.on ?? false;
      const file = await motion.export(clip, {
        format: settings.format === "BVH" ? "bvh" : "json",
        source: option("physics") ? "physics" : "reference",
        root_motion: option("root"),
        loop: option("loop"),
      });
      return { name: file.name, mediaType: file.media_type, content: file.content };
    },
  };
}
