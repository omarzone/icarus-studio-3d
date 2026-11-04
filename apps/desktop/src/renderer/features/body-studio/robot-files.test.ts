import { describe, expect, it } from "vitest";
import { checkRobotFiles, MAX_ROBOT_BYTES } from "./robot-files.ts";

describe("picking a robot's files", () => {
  it("takes a description with its meshes and names the description", () => {
    const check = checkRobotFiles([
      { name: "shin.stl", size: 684 },
      { name: "tiny_leg.urdf", size: 2048 },
    ]);
    expect(check).toEqual({ ok: true, name: "tiny_leg.urdf", facts: "Robot · 1 mesh · 3 KB" });
  });

  it("needs a description, refuses files it cannot use and keeps to the size limit", () => {
    expect(checkRobotFiles([{ name: "shin.stl", size: 1 }])).toMatchObject({ ok: false, problem: /\.urdf or MJCF/ });
    expect(
      checkRobotFiles([
        { name: "a.urdf", size: 1 },
        { name: "look.dae", size: 1 },
      ]),
    ).toMatchObject({
      ok: false,
      name: "look.dae",
    });
    expect(checkRobotFiles([{ name: "a.xml", size: MAX_ROBOT_BYTES + 1 }])).toMatchObject({ ok: false });
  });
});
