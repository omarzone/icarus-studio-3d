import type { SceneDescription } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import type { PlayLive } from "../../ports/play-port.ts";
import type { ScenePick } from "../../scene/scene-view.tsx";
import { instantAction, nextSpeed, pickAction } from "./play-tools.ts";

const scene: SceneDescription = {
  revision: 1,
  bodies: [],
  lights: [],
  geoms: [
    {
      name: "box_geom",
      body: "box",
      shape: "box",
      size: [0.5, 0.5, 0.5],
      position: [2, 0, 0.25],
      quaternion: [1, 0, 0, 0],
      color: "#ffffff",
    },
  ],
};
const live: PlayLive = {
  scene,
  poses: new Map([["box_geom", { position: [2.5, 0, 0.3], quaternion: [1, 0, 0, 0] }]]),
  rays: [],
  paused: false,
  speed: 1,
};
const pick = (object: string | null, point: [number, number, number]): ScenePick => ({
  object,
  point,
  direction: [0, 1, 0],
});
const onBox = pick("box", [2, 0, 0.5]);
const onGround = pick(null, [4, 1, 0]);

describe("play tools", () => {
  it("pushes and touches the clicked object, never the ground", () => {
    expect(pickAction("push", onBox, null, live).action).toEqual({
      tool: "push",
      object: "box",
      direction: [0, 1, 0],
    });
    expect(pickAction("touch", onBox, null, live).action).toEqual({
      tool: "touch",
      object: "box",
    });
    expect(pickAction("push", onGround, null, live).action).toBeNull();
  });

  it("moves in two clicks, keeping the object's height", () => {
    const first = pickAction("move", onBox, null, live);
    expect(first).toEqual({ action: null, held: "box" });
    const second = pickAction("move", onGround, first.held, live);
    expect(second).toEqual({ action: { tool: "move", object: "box", to: [4, 1, 0.3] }, held: null });
  });

  it("adds the piece standing on the clicked point", () => {
    expect(pickAction("add-object", onGround, null, live).action).toEqual({
      tool: "add-object",
      piece: "box",
      at: [4, 1, 0],
    });
    expect(pickAction("add-object", onGround, null, live, "sphere").action).toEqual({
      tool: "add-object",
      piece: "sphere",
      at: [4, 1, 0],
    });
  });

  it("acts at once for tools without a click, and cycles the speed", () => {
    expect(instantAction("reset")).toEqual({ tool: "reset" });
    expect(instantAction("push")).toBeNull();
    expect(nextSpeed("1×")).toBe("2×");
    expect(nextSpeed("4×")).toBe("0.25×");
    expect(nextSpeed("unknown")).toBe("1×");
  });
});
