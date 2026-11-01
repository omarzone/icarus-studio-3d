import type { PlayCommand } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PlayHandlers } from "../engine-client/play-socket.ts";
import { isPlayFrame, isPlayMessageEnvelope } from "../engine-client/response-checks.ts";
import { createEnginePlayPort } from "./play-engine.ts";
import type { PlayLive, PlaySession } from "./play-port.ts";
import { decisionBars, eventTime, playCommand, playSession, playTools, senseBars } from "./play-views.ts";
import play from "./testdata/play-frame.json";

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
      placing: "Click to place: Box",
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
      placing: undefined,
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
        { tool: "push", object: "box_2", impulse: [0, 10, 0] },
      ],
      [
        { tool: "add-object", piece: "box", at: [3, 0, 0] },
        { tool: "add_object", piece: "box", position: [3, 0, 0] },
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

  it("toggles back what Slow and Wind turned on, and cycles the light", () => {
    expect(playCommand({ tool: "slow" }, { ...controls, speed: 0.25 })).toEqual({ tool: "speed", speed: 1 });
    expect(playCommand({ tool: "wind" }, { ...controls, wind: true })).toEqual({ tool: "wind", velocity: [0, 0, 0] });
    expect(playCommand({ tool: "light" }, { ...controls, light: 0.3 })).toEqual({ tool: "light", intensity: 2.5 });
    expect(playCommand({ tool: "light" }, { ...controls, light: 2.5 })).toEqual({ tool: "light", intensity: 1 });
  });
});

describe("engine play port", () => {
  function setup() {
    const sent: PlayCommand[] = [];
    let handlers: PlayHandlers | undefined;
    const close = vi.fn();
    const open = vi.fn((_project: string, given: PlayHandlers) => {
      handlers = given;
      return { send: (command: PlayCommand) => sent.push(command), close };
    });
    const port = createEnginePlayPort(open);
    const updates: [PlaySession, PlayLive][] = [];
    const closed: string[] = [];
    const disconnect = port.connect("p", {
      onUpdate: (session, live) => updates.push([session, live]),
      onClosed: (reason) => closed.push(reason),
      onError: () => undefined,
    });
    const engine = () => {
      if (!handlers) {
        throw new Error("not connected");
      }
      return handlers;
    };
    return { port, sent, engine, updates, closed, close, disconnect };
  }

  it("streams a session and the live poses once the engine is ready and framing", async () => {
    const { port, engine, updates } = setup();
    const first = port.getSession("p");
    engine().onReady(info);
    expect(updates).toHaveLength(0);
    engine().onFrame(frame);
    await expect(first).resolves.toMatchObject({ status: { title: "Playing" }, selectedTool: "move" });
    const [session, live] = updates.at(-1) ?? [];
    expect(session?.tools).toHaveLength(7);
    expect(live?.scene).toBe(info.scene);
    expect(live?.poses.size).toBe(info.scene.geoms.length);
    expect(live?.poses.get("car")?.position[2]).toBeCloseTo(0.5, 2);
    expect(live).toMatchObject({ paused: false, speed: 1 });
  });

  it("draws the new scene a later ready brings (after Add object or Light)", () => {
    const { engine, updates } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    const scene = { ...info.scene, revision: 9 };
    engine().onReady({ ...info, scene });
    expect(updates.at(-1)?.[1].scene).toBe(scene);
  });

  it("keeps the newest 50 events first", () => {
    const { engine, updates } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    for (let index = 0; index < 55; index++) {
      engine().onEvent({ ...event, time: index, text: `Event ${index}` });
    }
    const events = updates.at(-1)?.[0].events ?? [];
    expect(events).toHaveLength(50);
    expect(events[0]).toEqual({ time: "0:54", text: "Event 54" });
  });

  it("sends tool actions and speed changes as commands", async () => {
    const { port, engine, sent } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
    await port.send({ project: "p", action: { tool: "slow" } });
    await expect(port.setSpeed({ project: "p", speed: "2×" })).resolves.toMatchObject({ speed: "2×" });
    expect(sent).toEqual([
      { tool: "speed", speed: 0.25 },
      { tool: "speed", speed: 2 },
    ]);
  });

  it("selects tools used by clicking, and leaves instant tools unselected", async () => {
    const { port, engine } = setup();
    engine().onReady(info);
    engine().onFrame(frame);
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

  it("closes the socket on leave and ignores what arrives after", async () => {
    const { port, engine, updates, close, disconnect } = setup();
    engine().onReady(info);
    disconnect();
    expect(close).toHaveBeenCalled();
    engine().onFrame(frame);
    expect(updates).toHaveLength(0);
    await expect(port.send({ project: "p", action: { tool: "reset" } })).rejects.toThrow("Play is not running");
  });
});
