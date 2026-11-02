import type { TaskInfo } from "@icarus/contracts";
import { isTaskInfo, isTaskInfos } from "./engine-event-checks.ts";
import { request } from "./request.ts";

// The long work the engine is doing for a project (training, autopilot, diagnoses, ideas, builds, copilot turns).
export const tasksApi = {
  list: (projectId: string): Promise<TaskInfo[]> =>
    request(`/tasks?${new URLSearchParams({ project: projectId }).toString()}`, {}, isTaskInfos),
  cancel: (taskId: string): Promise<TaskInfo> =>
    request(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }, isTaskInfo),
};
