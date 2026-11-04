import type { RobotImport, RobotImported } from "@icarus/contracts";
import { type RequestOptions, request } from "./request.ts";
import { isRobotImported } from "./response-checks.ts";

// URDF and MJCF robots read by the engine with MuJoCo and made the project's body.

export const robotApi = {
  importRobot: (projectId: string, body: RobotImport, options?: RequestOptions): Promise<RobotImported> =>
    request(
      `/projects/${encodeURIComponent(projectId)}/robots`,
      { method: "POST", body: JSON.stringify(body) },
      isRobotImported,
      options,
    ),
};

export type RobotApi = typeof robotApi;
