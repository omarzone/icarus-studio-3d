import type { Conversation, CopilotProposal, Project, SetBrain, SetProperty } from "@icarus/contracts";

type BrainSpec = Project["brain"];

// The copilot's proposal that can still be applied: open and made against the revision the project is at.
export function openProposal(conversation: Conversation, revision: number): CopilotProposal | null {
  return (
    conversation.proposals.find((proposal) => proposal.status === "open" && proposal.base_revision === revision) ?? null
  );
}

// The set_property operation of the proposal that gives this property of this object a new value.
export function proposedProperty(
  proposal: CopilotProposal | null,
  target: { object: string; component: string; property: string },
): SetProperty | undefined {
  const found = proposal?.operations.findLast(
    (operation) =>
      operation.op === "set_property" &&
      operation.object === target.object &&
      operation.component === target.component &&
      operation.property === target.property,
  );
  return found?.op === "set_property" ? found : undefined;
}

// The project's own brain after a set_brain operation, as the engine merges it: fields left out keep their value.
export function brainAfter(brain: BrainSpec, change: SetBrain): BrainSpec {
  const ppo = Object.fromEntries(Object.entries(change.ppo ?? {}).filter(([, value]) => value != null));
  return {
    ...brain,
    ...(change.copies != null ? { copies: change.copies } : {}),
    ...(change.algorithm != null ? { algorithm: change.algorithm } : {}),
    ...(change.layers != null ? { layers: change.layers } : {}),
    ...(change.training_steps != null
      ? { training_steps: change.training_steps === "recommended" ? null : change.training_steps }
      : {}),
    ...(Object.keys(ppo).length > 0 ? { ppo: { ...brain.ppo, ...ppo } } : {}),
  };
}

// The set_brain operations of the proposal that change the project's own brain, in order.
export function proposedBrainChanges(proposal: CopilotProposal | null): SetBrain[] {
  return (proposal?.operations ?? []).flatMap((operation) =>
    operation.op === "set_brain" && operation.agent == null ? [operation] : [],
  );
}
