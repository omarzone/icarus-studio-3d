import { isSaveChoice, type SaveChoice } from "../../shared/export-bridge.ts";
import { type BuildApi, buildApi } from "../engine-client/build-api.ts";
import type { BuildPort, ExportPlan } from "./build-port.ts";
import { DEFAULT_CHOICE, type ExportChoiceState, exportPlanView, hardwareSessionView } from "./build-views.ts";

// Build on the engine. The export choice and skipped parts are view state kept here per project; the engine plans,
// writes and checks. The save dialog is the main process's, through the preload bridge.

async function chooseDestination(name: string): Promise<SaveChoice> {
  const choice: unknown = await window.icarus.exports.chooseDestination(name);
  return isSaveChoice(choice)
    ? choice
    : { kind: "refused", reason: "The save dialog sent an answer the app cannot read" };
}

export function createEngineBuild(
  api: BuildApi = buildApi,
  choose: (name: string) => Promise<SaveChoice> = chooseDestination,
): BuildPort {
  const choices = new Map<string, ExportChoiceState>();
  const skipped = new Map<string, Set<string>>();
  const choiceOf = (project: string) => choices.get(project) ?? DEFAULT_CHOICE;
  const body = (choice: ExportChoiceState) => ({ format: choice.format, options: [...choice.options] });
  const plan = async (project: string): Promise<ExportPlan> => {
    const choice = choiceOf(project);
    return exportPlanView(await api.plan(project, body(choice)), choice);
  };
  const hardware = async (project: string) =>
    hardwareSessionView(await api.hardware(project, { skipped: [...(skipped.get(project) ?? [])] }));
  return {
    listTargets: (project) => api.targets(project),
    getExportPlan: plan,
    setExportFormat: ({ project, format }) => {
      choices.set(project, { ...choiceOf(project), format });
      return plan(project);
    },
    setExportOption: ({ project, id, on }) => {
      const options = new Set(choiceOf(project).options);
      if (on) {
        options.add(id);
      } else {
        options.delete(id);
      }
      choices.set(project, { ...choiceOf(project), options });
      return plan(project);
    },
    downloadExport: async (project) => {
      const current = await plan(project);
      const destination = await choose(current.name);
      if (destination.kind === "cancelled") {
        return { kind: "cancelled" };
      }
      if (destination.kind === "refused") {
        throw new Error(destination.reason);
      }
      const written = await api.write(project, { ...body(choiceOf(project)), destination: destination.path });
      return { kind: "saved", path: written.path, bytes: written.total_bytes };
    },
    getHardware: hardware,
    recheckPart: ({ project }) => hardware(project),
    skipPart: ({ project, part }) => {
      skipped.set(project, new Set([...(skipped.get(project) ?? []), part]));
      return hardware(project);
    },
  };
}
