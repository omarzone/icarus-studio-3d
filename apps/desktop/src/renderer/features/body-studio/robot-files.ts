import { formatBytes } from "../copilot/attachment-rules.ts";

// The files a robot is picked with: one URDF or MJCF description and the meshes it names, all sent together.

export const ROBOT_FILES = ".urdf,.xml,.mjcf,.stl,.obj,.msh";
// What the engine accepts for one robot's files together.
export const MAX_ROBOT_BYTES = 30 * 1000 * 1000;

const DESCRIPTION = /\.(urdf|xml|mjcf)$/i;
const MESH = /\.(stl|obj|msh)$/i;

type Facts = { name: string; size: number };
export type RobotCheck = { ok: true; name: string; facts: string } | { ok: false; name: string; problem: string };

export function checkRobotFiles(files: readonly Facts[]): RobotCheck {
  const descriptions = files.filter((file) => DESCRIPTION.test(file.name));
  const first = descriptions[0];
  if (!first) {
    const name = files[0]?.name ?? "No file";
    return { ok: false, name, problem: "Pick the robot's .urdf or MJCF .xml file together with its meshes" };
  }
  const other = files.find((file) => !DESCRIPTION.test(file.name) && !MESH.test(file.name));
  if (other) {
    return {
      ok: false,
      name: other.name,
      problem: `${other.name} is not a robot description or an .stl, .obj or .msh mesh`,
    };
  }
  const size = files.reduce((total, file) => total + file.size, 0);
  if (size > MAX_ROBOT_BYTES) {
    return {
      ok: false,
      name: first.name,
      problem: `The files are ${formatBytes(size)} together, more than ${formatBytes(MAX_ROBOT_BYTES)}`,
    };
  }
  const meshes = files.length - descriptions.length;
  const extra = descriptions.length > 1 ? ` · ${descriptions.length} descriptions` : "";
  const name = descriptions.length > 1 ? `${descriptions.length} robot files` : first.name;
  return {
    ok: true,
    name,
    facts: `Robot · ${meshes} ${meshes === 1 ? "mesh" : "meshes"}${extra} · ${formatBytes(size)}`,
  };
}
