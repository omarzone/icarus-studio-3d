import type { ProjectFootprint } from "../../ports/projects-port.ts";
import { formatBytes } from "./byte-size.ts";

const RUNS_LABEL = "Training runs and timelapses";

function runs(count: number): string {
  return `${count} training ${count === 1 ? "run" : "runs"}`;
}

// What deleting removes from this computer, and what it leaves behind.
export function deleteConsequences(name: string, { trainingRuns, runsBytes, runsFollowProject }: ProjectFootprint) {
  const size = runsBytes === null ? "" : ` (${formatBytes(runsBytes)})`;
  const lost =
    trainingRuns === 0
      ? `${name} is deleted from this computer.`
      : runsFollowProject
        ? `${name} and its ${runs(trainingRuns)}${size} are deleted from this computer.`
        : `${name} is deleted from this computer. Its ${runs(trainingRuns)} ${trainingRuns === 1 ? "stays" : "stay"} in the runs folder.`;
  return `${lost} Copies you published stay in the community until you remove them there.`;
}

// The duplicate dialog's runs switch: their size when they can be copied, or that they stay behind.
export function runsSwitchLabel({ trainingRuns, runsBytes, runsFollowProject }: ProjectFootprint): string {
  if (trainingRuns === 0) {
    return RUNS_LABEL;
  }
  if (!runsFollowProject) {
    const count = `${trainingRuns} ${trainingRuns === 1 ? "run stays" : "runs stay"}`;
    return `${RUNS_LABEL} · ${count} with the original`;
  }
  return runsBytes !== null && runsBytes > 0 ? `${RUNS_LABEL} · ${formatBytes(runsBytes)}` : RUNS_LABEL;
}
