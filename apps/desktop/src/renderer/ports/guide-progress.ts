import type { Project, RunStatus } from "@icarus/contracts";
import type { GuideProgress, GuideStep } from "./scene-port.ts";

// The getting-started checklist, read from the project document and its training runs.
export function guideProgress(project: Project, runs: readonly RunStatus[]): GuideProgress {
  const objects = [...project.world.objects, ...project.bodies.flatMap((body) => body.objects)];
  const training = runs.some((run) => run.state === "starting" || run.state === "running");
  // Play only uses a checkpoint that beat random actions, so that is what "trained" means here.
  const trained = runs.some((run) => (run.best_step ?? 0) > 0);
  const steps: GuideStep[] = [
    { id: "body", done: project.bodies.length > 0 },
    { id: "goal", done: objects.some((obj) => obj.components.some((component) => component.kind === "goal_zone")) },
    { id: "rewards", done: project.task.rewards.length > 0 },
    trained || !training ? { id: "trained", done: trained } : { id: "trained", done: false, training: true },
  ];
  const done = steps.filter((step) => step.done).length;
  return { started: done > 0, done, total: steps.length, steps };
}
