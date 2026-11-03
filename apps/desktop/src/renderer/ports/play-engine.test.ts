import type { PlayCommand, PlayPiece as PlayPieceInfo } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PlayHandlers, PlayOptions } from "../engine-client/play-socket.ts";
import { isPlayFrame, isPlayMessageEnvelope } from "../engine-client/response-checks.ts";
import { createEnginePlayPort, type PlayPacing } from "./play-engine.ts";
import type { PlayDrop, PlayLive, PlaySession, PlayStage } from "./play-port.ts";
import { decisionBars, dropCommand, eventTime, playCommand, playSession, playTools, senseBars } from "./play-views.ts";
import play from "./testdata/play-frame.json";

const DROP: PlayDrop = {
  piece: "box",
  placement: "drop",
  scale: 1,
  weight: null,
  friction: null,
  bounciness: null,
  color: null,
  height: 2,
  speed: 6,
  count: 1,
  interval: 0.5,
  spread: 1,
};

const { info, frame, event } = (() => {
  const messages = [play.ready, play.frame, play.event].map((envelope) => {
    if (!isPlayMessageEnvelope(envelope)) {
      throw new Error("bad test data");
    }
    return envelope.message;
  });
  const [ready, framed, evented] = messages;
  if (ready?.type !== "ready" || framed?.type !== "frame" || evented?.type !== "event" || !isPlayFrame(framed.frame)) {
    throw new Error("bad test data");
  }
  return { info: ready.session, frame: framed.frame, event: evented.event };
})();

describe("play mappers", () => {
  it("shows senses as bars within their range, warning when a ray is close", () => {
    const [ray] = frame.senses;
    if (!ray) {
      throw new Error("bad test data");
    }
    expect(senseBars(frame.senses)).toHaveLength(5);
    expect(senseBars([ray])).toEqual([
      { id: "car:ray0", label: "Car distance 1", ratio: 1, display: "10 m", tone: "default" },
    ]);
    expect(senseBars([{ ...ray, value: 1.5 }])[0]).toMatchObject({ ratio: 0.15, display: "1.5 m", tone: "warn" });
    expect(senseBars([{ ...ray, value: 14 }])[0]).toMatchObject({ ratio: 1 });
    expect(senseBars([{ ...ray, unit: "rad/s", value: 0.034 }])[0]).toMatchObject({
      display: "0.03 rad/s",
      tone: "default",
    });
  });

  it("shows actuator outputs as bars from their control range", () => {
    expect(decisionBars(frame.actions)).toEqual([
      { id: "steer_left:motor", label: "Front left steering", ratio: 0.381, display: "-0.15 rad", tone: "default" },
      { id: "wheel_rear_left:motor", label: "Rear left wheel", ratio: 0.43, display: "-0.14", tone: "default" },
      { id: "steer_right:motor", label: "Front right steering", ratio: 0.489, display: "-0.01 rad", tone: "default" },
      { id: "wheel_rear_right:motor", label: "Rear right wheel", ratio: 0.976, display: "0.95", tone: "default" },
    ]);
  });

  it("writes event times as minutes and seconds", () => {
    expect(eventTime(event.time)).toBe("0:02");
    expect(eventTime(75.2)).toBe("1:15");
  });

  it("offers the tools the engine offers, in the view's ids", () => {
    expect(playTools(info.tools).map((tool) => tool.id)).toEqual([
      "move",
      "push",
      "add-object",
      "light",
      "wind",
      "slow",
      "reset",
    ]);
  });

  it("builds the session the Play panels show", () => {
    const events = [{ time: "0:02", text: event.text }];
    const session = playSession({ info, frame, events, selectedTool: "add-object" });
    expect(session).toMatchObject({
      views: ["Game view"],
      selectedTool: "add-object",
      pieces: [],
      speed: "1×",
      paused: false,
      status: { title: "Playing", detail: "12.0 m to the parking spot" },
      senses: { note: "Reward -0.01 · episode return -0.43" },
      decisions: { brain: "Untrained brain: random actions" },
      events,
    });
    expect(session.senses.bars).toHaveLength(5);
    expect(session.decisions?.bars).toHaveLength(4);
    expect(playSession({ info, frame: { ...frame, speed: 0.25 }, events, selectedTool: "push" })).toMatchObject({
      speed: "0.25×",
    });
  });
});

describe("play commands", () => {
  const controls = { speed: 1, light: 1, wind: false };

  it("turns tool actions into engine commands", () => {
    const cases: [Parameters<typeof playCommand>[0], PlayCommand][] = [
      [
        { tool: "move", object: "box_2", to: [1, 2, 0] },
        { tool: "move", object: "box_2", position: [1, 2, 0] },
      ],
      [
        { tool: "push", object: "box_2", direction: [0, 1, 0] },
        { tool: "push", object: "box_2", direction: [0, 1, 0], speed: 1.5 },
      ],
      [
        { tool: "add-object", drop: { ...DROP, placement: "place" }, at: [3, 0, 0] },
        { tool: "add_object", piece: "box", position: [3, 0, 0], placement: "place", scale: 1 },
      ],
      [
        { tool: "touch", object: "foot" },
        { tool: "touch", object: "foot" },
      ],
      [
        { tool: "pause", paused: true },
        { tool: "pause", paused: true },
      ],
      [{ tool: "reset" }, { tool: "reset" }],
      [{ tool: "shuffle" }, { tool: "shuffle" }],
      [{ tool: "slow" }, { tool: "speed", speed: 0.25 }],
      [{ tool: "light" }, { tool: "light", intensity: 0.3 }],
      [{ tool: "wind" }, { tool: "wind", velocity: [4, 0, 0] }],
    ];
    for (const [action, command] of cases) {
      expect(playCommand(action, controls)).toEqual(command);
    }
  });

  it("sends only the drop choices that apply: height and speed by placement, the set weight, copies over one", () => {
    expect(dropCommand(DROP, [1, 2, 0])).toEqual({
      tool: "add_object",
      piece: "box",
      position: [1, 2, 0],
      placement: "drop",
      scale: 1,
      height: 2,
    });
    const thrown: PlayDrop = {
      ...DROP,
      piece: "ball",
      placement: "throw",
      speed: 9,
      weight: { kind: "density", value: 800 },
      friction: 0.3,
      bounciness: 0.7,
      color: "#ff0000",
      count: 5,
      interval: 0.2,
      spread: 1.5,
    };
    expect(dropCommand(thrown, [0, 0, 0])).toEqual({
      tool: "add_object",
      piece: "ball",
      position: [0, 0, 0],
      placement: "throw",
      scale: 1,
      height: 2,
      speed: 9,
      density: 800,
      friction: 0.3,
      bounciness: 0.7,
      color: "#ff0000",
      count: 5,
      interval: 0.2,
      spread: 1.5,
    });
  });

  it("toggles back what Slow and Wind turned on, and cycles the light", () => {
    expect(playCommand({ tool: "slow" }, { ...controls, speed: 0.25 })).toEqual({ tool: "speed", speed: 1 });
    expect(playCommand({ tool: "wind" }, { ...controls, wind: true })).toEqual({ tool: "wind", velocity: [0, 0, 0] });
    expect(playCommand({ tool: "light" }, { ...controls, light: 0.3 })).toEqual({ tool: "light", intensity: 2.5 });
    expect(playCommand({ tool: "light" }, { ...controls, light: 2.5 })).toEqual({ tool: "light", intensity: 1 });
  });
});

// Paints only when the test says so, at the time the test sets.
function manualPacing() {
  let pending: (() => void)[] = [];
  let time = 0;
  const pacing: PlayPacing = { nextPaint: (publish) => pending.push(publish), now: () => time };
  const paint = (advance = 0) => {
    time += advance;
    const due = pending;
    pending = [];
    for (const publish of due) {
      publish();
    }
  };
  return { pacing, paint };
}

describe("engine play port", () => {
  function setup() {
    const { pacing, paint } = manualPacing();
    const sent: PlayCommand[] = [];
    let handlers: PlayHandlers | undefined;
    const close = vi.fn();
    const open = vi.fn((_project: string, given: PlayHandlers) => {
      handlers = given;
      return { send: (command: PlayCommand) => sent.push(command), close };
    });
    const port = createEnginePlayPort(open, undefined, pacing);
    const updates: [PlaySession, PlayLive][] = [];
    const closed: string[] = [];
    const stages: PlayStage[] = [];
    const disconnect = port.connect("p", {
      onUpdate: (session, live) => updates.push([session, live]),
      onClosed: (reason) => closed.push(reason),
      onError: () => undefined,
      onProgress: (stage) => stages.push(stage),
    });
    const engine = () => {
      if (!handlers) {
        throw new Error("not connected");
      }
      return handlers;
    };
    return { port, sent, engine, updates, closed, close, disconnect, stages, paint };
  }

  it("passes on what the engine is doing while the session opens, and nothing after leaving", () => {
    const { engine, stages, disconnect } = setup();
    engine().onProgress?.("world");
    engine().onProgress?.("brain");
    expect(stages).toEqual(["world", "brain"]);
    disconnect();
    engine().onProgress?.("starting");
    expect(stages).toEqual(["world", "brain"]);
  });

  it("lists the pieces Add object can bring, from the session the engine sent", async () => {
    const { port, engine, paint } = setup();
    const piece: PlayPieceInfo = {
      id: "ball",
      label: "Ball",
      category: "basics",
      shape: "sphere",
      size: [0.3, 0.3, 0.3],
      mass: 0.5,
      friction: 0.8,
      bounciness: 0,
      color: "#d9534f",
    };
    engine().onReady({ ...info, pieces: [piece] });
    engine().onFrame(frame);
    paint();
    const session = await port.getSession("p");
    expect(session.pieces).toEqual([
      { id: "ball", label: "Ball", category: "basics", mass: 0.5, friction: 0.8, bounciness: 0, color: "#d9534f" },
    ]);
  });

  it("streams a session and the live poses once the engine is ready and framing", async () => {
    const { port, engine, updates, paint } = setup();
    const first = port.getSession("p");
    engine().onReady(info);
    paint();
    expect(updates).toHaveLength(0);
    engine().onFrame(frame);
    paint();
    await expect(first).resolves.toMatchObject({ status: { title: "Playing" }, selectedTool: "move" });
    const [session, live] = updates.at(-1) ?? [];
    expect(session?.tools).toHaveLength(7);
    expect(live?.scene).toBe(info.scene);
    expect(live?.poses.size).toBe(info.scene.geoms.length);
    expect(live?.poses.get("car")?.position[2]).toBeCloseTo(0.5, 2);
    expect(live).toMatchObject({ paused: false, speed: 1 });
  });

  it("draws the new scene a later ready brings (after Add object or Light)", () => {
    const { engine, updates, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    paint();
    const scene = { ...info.scene, revision: 9 };
    engine().onReady({ ...info, scene });
    paint();
    expect(updates.at(-1)?.[1].scene).toBe(scene);
  });

  it("keeps the newest 50 events first", () => {
    const { engine, updates, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    for (let index = 0; index < 55; index++) {
      engine().onEvent({ ...event, time: index, text: `Event ${index}` });
    }
    paint();
    const events = updates.at(-1)?.[0].events ?? [];
    expect(events).toHaveLength(50);
    expect(events[0]).toEqual({ time: "0:54", text: "Event 54" });
  });

  it("sends tool actions and speed changes as commands", async () => {
    const { port, engine, sent, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    paint();
    await port.send({ project: "p", action: { tool: "slow" } });
    await expect(port.setSpeed({ project: "p", speed: "2×" })).resolves.toMatchObject({ speed: "2×" });
    expect(sent).toEqual([
      { tool: "speed", speed: 0.25 },
      { tool: "speed", speed: 2 },
    ]);
  });

  it("selects tools used by clicking, and leaves instant tools unselected", async () => {
    const { port, engine, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    paint();
    await expect(port.selectTool({ project: "p", tool: "push" })).resolves.toMatchObject({ selectedTool: "push" });
    await expect(port.selectTool({ project: "p", tool: "reset" })).resolves.toMatchObject({ selectedTool: "push" });
  });

  it("fails the session when the engine closes before it is ready", async () => {
    const { port, engine, closed } = setup();
    const waiting = port.getSession("p");
    engine().onClosed("No project with that id");
    expect(closed).toEqual(["No project with that id"]);
    await expect(waiting).rejects.toThrow("No project with that id");
    await expect(port.getSession("p")).rejects.toThrow("No project with that id");
  });

  it("publishes once per paint with the newest poses, and the panels at most every 100 ms", () => {
    const { engine, updates, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    engine().onEvent(event);
    engine().onFrame({ ...frame, time: frame.time + 0.03 });
    paint();
    expect(updates).toHaveLength(1);
    const [first] = updates[0] ?? [];
    expect(first?.events).toHaveLength(1);
    const moved = (x: number) => ({
      ...frame,
      geoms: frame.geoms.map((geom) => ({ ...geom, position: [x, 0, 0] satisfies [number, number, number] })),
    });
    engine().onFrame(moved(1));
    paint(33);
    engine().onFrame(moved(2));
    paint(33);
    expect(updates).toHaveLength(3);
    expect(updates[1]?.[0]).toBe(first);
    expect(updates[2]?.[0]).toBe(first);
    expect(updates[2]?.[1].poses.get("car")?.position).toEqual([2, 0, 0]);
    engine().onEvent({ ...event, text: "Later" });
    engine().onFrame(moved(3));
    paint(40);
    const [later] = updates.at(-1) ?? [];
    expect(later).not.toBe(first);
    expect(later?.events[0]?.text).toBe("Later");
  });

  it("shows a newly selected tool on the next publish, without waiting for the panels' interval", async () => {
    const { port, engine, updates, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    paint();
    await port.selectTool({ project: "p", tool: "push" });
    engine().onFrame(frame);
    paint(10);
    expect(updates.at(-1)?.[0].selectedTool).toBe("push");
  });

  it("closes the socket on leave and ignores what arrives after", async () => {
    const { port, engine, updates, close, disconnect, paint } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    disconnect();
    expect(close).toHaveBeenCalled();
    engine().onFrame(frame);
    paint();
    expect(updates).toHaveLength(0);
    await expect(port.send({ project: "p", action: { tool: "reset" } })).rejects.toThrow("Play is not running");
  });
});

describe("play brains", () => {
  const option = {
    run_id: "run-1",
    step: 25000,
    revision_number: 3,
    label: "Run 1 · 25k steps · revision 3 · 80% success",
    success_rate: 0.8,
    fits: false,
    reason: "The body changed: 14 senses now, 13 then",
    default: false,
  };

  it("lists the engine's brains, keeping why one cannot play", async () => {
    const port = createEnginePlayPort(vi.fn(), {
      playBrains: async () => [option, { ...option, run_id: "run-2", fits: true, reason: null, default: true }],
    });
    await expect(port.brains("p")).resolves.toEqual([
      { runId: "run-1", step: 25000, label: option.label, fits: false, reason: option.reason, isDefault: false },
      { runId: "run-2", step: 25000, label: option.label, fits: true, reason: undefined, isDefault: true },
    ]);
  });

  it("opens Play with the chosen brain and names the run that plays", () => {
    let handlers: PlayHandlers | undefined;
    const open = vi.fn((_project: string, given: PlayHandlers, _options?: PlayOptions) => {
      handlers = given;
      return { send: () => undefined, close: () => undefined };
    });
    const updates: PlaySession[] = [];
    const listener = {
      onUpdate: (session: PlaySession) => updates.push(session),
      onClosed: () => undefined,
      onError: () => undefined,
    };
    const { pacing, paint } = manualPacing();
    createEnginePlayPort(open, undefined, pacing).connect("p", listener, { runId: "run-1", step: 25000 });
    expect(open.mock.calls[0]?.[2]).toEqual({ brain: { runId: "run-1", step: 25000 } });
    handlers?.onReady({ ...info, brain: "Trained brain: Run 1 at 25,000 steps", run_id: "run-1", step: 25000 });
    handlers?.onFrame(frame);
    paint();
    expect(updates.at(-1)?.decisions?.playing).toEqual({ runId: "run-1", step: 25000 });
  });
});
