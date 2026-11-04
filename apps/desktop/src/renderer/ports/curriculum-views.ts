import type { Project, RunStatus } from "@icarus/contracts";
import type { CurriculumStage } from "./brain-port.ts";
import type { GoalState } from "./copilot-port.ts";

type Stage = NonNullable<Project["task"]["curriculum"]>[number];
type Setting = NonNullable<Stage["settings"]>[number];

// The settings a stage may change, as the engine's CurriculumParameter names them.
function settingText(setting: Setting): string {
  const value = Number(setting.value.toFixed(2));
  switch (setting.parameter) {
    case "episode_seconds":
      return `${value} s per try`;
    case "goal_distance":
      return `starts ${value} m from the goal`;
    case "heading_range":
      return `turned up to ${value}°`;
    case "align_within":
      return `aligned within ${value}°`;
    case "stop_speed":
      return `stops below ${value} m/s`;
  }
}

function promotionText(stage: Stage, last: boolean): string {
  if (last) {
    return "Last stage: training stays here";
  }
  const rate = Math.round((stage.promote?.success_rate ?? 0.8) * 100);
  return `Next stage at ${rate}% success over the last ${stage.promote?.episodes ?? 20} tries`;
}

// The task's curriculum stages; `active` marks the one a run of this revision practices now.
export function curriculumView(task: Project["task"], active?: number | null): CurriculumStage[] {
  const stages = task.curriculum ?? [];
  return stages.map((stage, index) => {
    const settings = (stage.settings ?? []).map(settingText);
    const changes = settings.length > 0 ? `${settings.join(", ")}. ` : "The task as it is. ";
    return {
      id: `stage-${index + 1}`,
      name: stage.name,
      detail: `${changes.charAt(0).toUpperCase()}${changes.slice(1)}${promotionText(stage, index === stages.length - 1)}`,
      active: index === active,
    };
  });
}

// The stage a training run of the project's current revision practices now, if one trains.
export function activeStage(runs: readonly RunStatus[], revision: number): number | null {
  const training = runs.find(
    (run) => run.revision_number === revision && ["starting", "running", "stopping"].includes(run.state),
  );
  return training?.stage ?? null;
}

// A run's curriculum stages as card goals: passed, practiced now, or still ahead; a finished run practices none.
export function stageGoals(
  stages: readonly string[],
  stage: number | null | undefined,
  training: boolean,
): { text: string; state: GoalState }[] {
  const current = stage ?? 0;
  return stages.map((name, index) => {
    let state: GoalState = "todo";
    if (index < current) {
      state = "done";
    } else if (index === current && training) {
      state = "running";
    }
    return { text: `Stage ${index + 1}: ${name}`, state };
  });
}
