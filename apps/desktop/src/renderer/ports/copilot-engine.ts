import type { SendMessage } from "@icarus/contracts";
import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import { withCopilot } from "./copilot-connection.ts";
import type { CopilotPort } from "./copilot-port.ts";
import { changedGeoms, conversationView, openProposal, proposalView } from "./copilot-views.ts";

// The copilot on the engine: one conversation per project; proposals change it only once applied.

type CopilotApi = Pick<
  EngineApi,
  "conversation" | "sendMessage" | "setAutonomy" | "applyProposal" | "discardProposal" | "proposalScene" | "scene"
>;

export type EngineCopilot = Omit<CopilotPort, "attachFile">;

export function createEngineCopilot(api: CopilotApi = engineApi): EngineCopilot {
  return {
    getConversation: async (key) => conversationView(await withCopilot(api.conversation(key))),
    sendMessage: async ({ key, text, selection, workspace }) => {
      const body: SendMessage = { text };
      if (selection) {
        body.selection = selection;
      }
      if (workspace) {
        body.workspace = workspace;
      }
      return conversationView(await withCopilot(api.sendMessage(key, body)));
    },
    applyProposal: async ({ id }) => conversationView(await withCopilot(api.applyProposal(id))),
    discardProposal: async ({ id }) => conversationView(await withCopilot(api.discardProposal(id))),
    setAutonomy: async ({ key, mode }) => conversationView(await withCopilot(api.setAutonomy(key, { autonomy: mode }))),
    getPreview: async (key) => {
      const open = openProposal(await withCopilot(api.conversation(key)));
      if (!open) {
        return null;
      }
      const [proposed, current] = await Promise.all([withCopilot(api.proposalScene(open.id)), api.scene(key)]);
      return { id: open.id, revision: proposalView(open).revision, geoms: changedGeoms(current.geoms, proposed.geoms) };
    },
  };
}
