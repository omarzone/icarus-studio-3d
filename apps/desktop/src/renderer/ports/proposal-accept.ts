import type { CopilotProposal, EditOperation, LibraryCatalog, ProjectState } from "@icarus/contracts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { brainInspection, changesSetting } from "./brain-settings-views.ts";
import { openProposal, proposedBrainChanges, proposedProperty } from "./proposed-values.ts";
import type { Inspection } from "./scene-port.ts";
import { findObject, inspection } from "./scene-views.ts";

export type ProposalApi = Pick<EngineApi, "project" | "conversation" | "applyProposal" | "applyOperations">;

export type AcceptInput = {
  scene: string;
  section: string;
  property: string;
  selected: string | null;
  catalog: LibraryCatalog;
};

// A proposal that is only this change is applied as the proposal; otherwise the one operation carrying the value
// goes through the same validated edit path, and the rest of the proposal is left for the person to decide.
async function applyChange(
  api: ProposalApi,
  scene: string,
  proposal: CopilotProposal,
  operation: EditOperation,
  summary: string,
): Promise<ProjectState> {
  if (proposal.operations.length === 1) {
    await api.applyProposal(proposal.id);
    return api.project(scene);
  }
  return api.applyOperations(scene, [operation], summary);
}

// Accepts the value the copilot's open proposal gives one property of the selection, or one brain setting.
export async function acceptProposedValue(api: ProposalApi, input: AcceptInput): Promise<Inspection> {
  const { scene, section, property, selected, catalog } = input;
  const [state, conversation] = await Promise.all([api.project(scene), api.conversation(scene)]);
  const proposal = openProposal(conversation, state.revision.number);
  if (!proposal) {
    throw new Error("The copilot no longer proposes this value; ask it again");
  }
  const obj = findObject(state.project, selected);
  const change = obj && proposedProperty(proposal, { object: obj.id, component: section, property });
  if (obj && change) {
    const kind = obj.components.find((component) => component.id === section)?.kind;
    const label = catalog.components.find((item) => item.kind === kind)?.properties.find((p) => p.id === property);
    const summary = `Accepted the copilot's ${label?.label ?? property} for ${obj.name}`;
    const next = await applyChange(api, scene, proposal, change, summary);
    return inspection(next.project, catalog, selected);
  }
  const setting = catalog.brain_settings?.find((schema) => schema.id === property);
  const brain =
    setting &&
    proposedBrainChanges(proposal).findLast((item) => changesSetting(state.project, catalog, property, item));
  if (!setting || !brain) {
    throw new Error("The copilot no longer proposes this value; ask it again");
  }
  const summary = `Accepted the copilot's ${setting.label.toLowerCase()}`;
  const next = await applyChange(api, scene, proposal, brain, summary);
  return brainInspection(next.project, catalog);
}
