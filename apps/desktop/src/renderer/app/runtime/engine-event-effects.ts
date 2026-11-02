import type { AgentStep, EngineEvent, TaskInfo } from "@icarus/contracts";

type TaskProgressEvent = Extract<EngineEvent, { type: "task_progress" }>;

// What each engine event changes in the app: the cached reads to fetch again, the live steps of a copilot turn
// and the progress of a running task.

export type QueryPrefix = readonly string[];

const PROJECT_DOCUMENT = (project: string): QueryPrefix[] => [
  ["scene", project],
  ["projects"],
  ["revisions"],
  ["scene-thumbnail"],
  ["copilot-preview"],
];

export function eventInvalidations(event: EngineEvent, project: string): QueryPrefix[] {
  switch (event.type) {
    case "revision_created":
      return PROJECT_DOCUMENT(project);
    case "proposal_created":
      return [["copilot"], ["copilot-preview"]];
    case "proposal_applied":
      return [["copilot"], ...PROJECT_DOCUMENT(project)];
    case "task_started":
      return [["tasks", project]];
    case "task_finished":
      return [
        ["tasks", project],
        ["training", project],
        ["results", project],
      ];
    case "diagnosis_created":
      return [["results", project]];
    case "message_posted":
      return [["copilot", project]];
    case "run_event":
      // A run started from the chat or the autopilot takes over the Train view once the run list reads again.
      return event.event.type === "status" ? [["training", project, "runs"]] : [];
    case "turn_started":
    case "step":
    case "view_taken":
    case "turn_finished":
    case "task_progress":
    case "hook_decision":
      return [];
  }
}

export function nextLiveSteps(steps: readonly AgentStep[], event: EngineEvent): readonly AgentStep[] {
  if (event.type === "turn_started" || event.type === "turn_finished") {
    return [];
  }
  return event.type === "step" ? [...steps, event.step] : steps;
}

export function withTaskProgress(tasks: TaskInfo[] | undefined, event: TaskProgressEvent): TaskInfo[] | undefined {
  return tasks?.map((task) => (task.id === event.task_id ? { ...task, progress: event.progress } : task));
}
