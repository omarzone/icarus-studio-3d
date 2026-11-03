import type { RunStatus, SceneDescription, SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { createMotionPlayer } from "../scene/motion-player.ts";
import { agentComparison } from "./agent-comparison.ts";
import { groupRuns, joinedPlayer, joinPoses, joinReplayFrames, joinScenes, joinSignals } from "./agent-lanes.ts";

const pose = (x: number) => ({
  position: [x, 0, 0] as [number, number, number],
  quaternion: [1, 0, 0, 0] as [number, number, number, number],
});

function geom(name: string, body: string): SceneGeom {
  return {
    name,
    body,
    shape: "box",
    size: [1, 1, 1],
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    color: "#ffffff",
  };
}

function scene(geoms: SceneGeom[]): SceneDescription {
  return { revision: 1, bodies: [], geoms, lights: [] };
}

function run(id: string, agent: string, started: string, extra: Partial<RunStatus> = {}): RunStatus {
  return {
    run_id: id,
    project_id: "p",
    revision_number: 1,
    name: `Run 1 · ${agent}`,
    state: "running",
    step: 0,
    total_steps: 10_000,
    copies: 1,
    steps_per_second: 0,
    started_at: started,
    agent: agent.toLowerCase(),
    agent_name: agent,
    group: "group-1",
    ...extra,
  };
}

describe("agents in one scene", () => {
  it("joins the shared world once and each agent's own body and lane", () => {
    const walker = scene([geom("ground", "ground"), geom("torso", "torso"), geom("lane1_board", "lane1_board")]);
    const car = scene([geom("ground", "ground"), geom("car", "car"), geom("lane2_board", "lane2_board")]);
    expect(joinScenes([walker, car])?.geoms.map((item) => item.name)).toEqual([
      "ground",
      "torso",
      "lane1_board",
      "car",
      "lane2_board",
    ]);
    expect(joinScenes([])).toBeNull();
  });

  it("puts every agent's copy in one set of poses and keeps every lane's scoreboard reading", () => {
    const joined = joinPoses([new Map([["torso", pose(1)]]), undefined, new Map([["car", pose(2)]])]);
    expect([...joined.keys()]).toEqual(["torso", "car"]);
    const signals = joinSignals([
      { displays: [{ object: "lane1_time", value: 3 }] },
      null,
      { displays: [{ object: "lane2_time", value: 5 }] },
    ]);
    expect(signals?.displays?.map((reading) => reading.value)).toEqual([3, 5]);
  });

  it("plays each agent's first copy from its own recorded motion", () => {
    const walker = createMotionPlayer("realtime");
    const car = createMotionPlayer("realtime");
    walker.push([[{ episode: 0, time: 0, poses: new Map([["torso", pose(1)]]), rays: [] }]], 0);
    car.push(
      [
        [{ episode: 0, time: 0, poses: new Map([["car", pose(4)]]), rays: [] }],
        [{ episode: 0, time: 0, poses: new Map([["car", pose(9)]]), rays: [] }],
      ],
      0,
    );
    const played = joinedPlayer(() => [walker, car]).sample(0);
    expect(played.copies).toHaveLength(1);
    expect(played.copies[0]?.get("car")?.position[0]).toBe(4);
    expect(played.copies[0]?.get("torso")?.position[0]).toBe(1);
  });

  it("replays every agent on the longest episode's clock, a finished agent holding its last pose", () => {
    const frames = joinReplayFrames([
      [
        { time: 0, poses: new Map([["torso", pose(0)]]) },
        { time: 1, poses: new Map([["torso", pose(1)]]) },
      ],
      [
        { time: 0, poses: new Map([["car", pose(0)]]) },
        { time: 0.5, poses: new Map([["car", pose(5)]]) },
        { time: 2, poses: new Map([["car", pose(20)]]) },
      ],
    ]);
    expect(frames.map((frame) => frame.time)).toEqual([0, 0.5, 2]);
    expect(frames.map((frame) => frame.poses.get("torso")?.position[0])).toEqual([0, 0, 1]);
    expect(frames.map((frame) => frame.poses.get("car")?.position[0])).toEqual([0, 5, 20]);
  });

  it("orders a group's runs as they started and compares its agents from their own checkpoints", () => {
    const runs = [
      run("b", "Car", "2026-01-01T00:00:00.002Z", { best_step: 10_000 }),
      run("solo", "Walker", "2026-01-01T00:00:00.000Z", { group: null, agent: null, agent_name: null }),
      run("a", "Walker", "2026-01-01T00:00:00.001Z", { best_step: 10_000 }),
    ];
    expect(groupRuns(runs, "group-1").map((item) => item.run_id)).toEqual(["a", "b"]);
    const checkpoint = (step: number, success: number) => ({
      step,
      episode_return: 1,
      success_rate: success,
      has_rollout: true,
    });
    const [car, , walker] = runs;
    if (!car || !walker) {
      throw new Error("runs missing");
    }
    const compared = agentComparison([
      { run: car, checkpoints: [checkpoint(0, 0), checkpoint(10_000, 0.4)] },
      { run: walker, checkpoints: [checkpoint(0, 0), checkpoint(10_000, 0)] },
    ]);
    expect(compared?.rows.map((row) => [row.agent, row.success, row.firstSuccess])).toEqual([
      ["Walker", "0%", "not yet"],
      ["Car", "40%", "10k"],
    ]);
    expect(compared?.fastest).toBe("Car");
  });
});
