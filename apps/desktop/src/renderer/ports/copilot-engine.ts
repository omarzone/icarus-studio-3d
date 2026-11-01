import type { AttachmentUpload, Conversation as EngineConversation, SendMessage } from "@icarus/contracts";
import { type AttachmentApi, attachmentApi } from "../engine-client/attachment-api.ts";
import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import { withCopilot } from "./copilot-connection.ts";
import type { CopilotPort } from "./copilot-port.ts";
import {
  attachmentView,
  changedGeoms,
  conversationView,
  hasAttachments,
  openProposal,
  proposalView,
} from "./copilot-views.ts";

// The copilot on the engine: one conversation per project; proposals change it only once applied.

type CopilotApi = Pick<
  EngineApi,
  "conversation" | "sendMessage" | "setAutonomy" | "applyProposal" | "discardProposal" | "proposalScene" | "scene"
>;

type SendIds = NonNullable<SendMessage["attachments"]>;
type ViewIds = NonNullable<SendMessage["views"]>;
type FrameList = NonNullable<AttachmentUpload["frames"]>;

// The contract caps these lists; the composer and the scene views keep within the caps.
const fitsAttachments = (ids: string[]): ids is SendIds => ids.length <= 10;
const fitsViews = (ids: string[]): ids is ViewIds => ids.length <= 4;
const fitsFrames = (frames: string[]): frames is FrameList => frames.length <= 12;

export function createEngineCopilot(api: CopilotApi = engineApi, files: AttachmentApi = attachmentApi): CopilotPort {
  // Addresses are only needed (and the engine asked) when a message carries files.
  const view = async (pending: Promise<EngineConversation>) => {
    const conversation = await withCopilot(pending);
    return conversationView(conversation, hasAttachments(conversation) ? await files.attachmentLinks() : null);
  };
  return {
    getConversation: (key) => view(api.conversation(key)),
    sendMessage: ({ key, text, selection, workspace, attachments = [], views = [] }) => {
      const body: SendMessage = { text };
      if (selection) {
        body.selection = selection;
      }
      if (workspace) {
        body.workspace = workspace;
      }
      const attached = [...attachments];
      if (attached.length > 0 && fitsAttachments(attached)) {
        body.attachments = attached;
      }
      const looked = [...views];
      if (looked.length > 0 && fitsViews(looked)) {
        body.views = looked;
      }
      return view(api.sendMessage(key, body));
    },
    applyProposal: ({ id }) => view(api.applyProposal(id)),
    discardProposal: ({ id }) => view(api.discardProposal(id)),
    setAutonomy: ({ key, mode }) => view(api.setAutonomy(key, { autonomy: mode })),
    attachFile: async ({ key, kind, name, mediaType, data, frames = [], text }) => {
      const body: AttachmentUpload = { kind, name, media_type: mediaType, data };
      const stills = [...frames];
      if (stills.length > 0 && fitsFrames(stills)) {
        body.frames = stills;
      }
      if (text !== undefined) {
        body.text = text;
      }
      const [info, links] = await Promise.all([files.uploadAttachment(key, body), files.attachmentLinks()]);
      return attachmentView(info, links);
    },
    readAttachmentText: (id) => files.attachmentText(id),
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
