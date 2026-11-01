import { BUILD_CONVERSATIONS } from "./build-conversations.fixture.ts";
import type { ChatAttachment, ChatMessage, Conversation, CopilotPort, ProposalStatus } from "./copilot-port.ts";
import { STUDIO_CONVERSATIONS } from "./copilot-studios.fixture.ts";
import { TRAINING_CONVERSATIONS } from "./training-conversations.fixture.ts";

// Sample conversations from the design, one per workspace, used only by the prototype, the design gallery and tests.
const worldChips = [
  { text: "Add rain", intent: "propose-change" },
  { text: "Make the spots tighter", intent: "propose-change" },
  { text: "Night time", intent: "propose-change" },
] as const;

const starterChips = [
  { text: "A car that learns to park", intent: "new-idea" },
  { text: "Import my robot", intent: "import" },
  { text: "A dancer from a video", intent: "motion-video" },
] as const;

const CONVERSATIONS: Readonly<Record<string, Conversation>> = {
  "park-pilot": {
    autonomy: "ask",
    suggestions: worldChips,
    messages: [
      { id: "u1", role: "user", text: "Make the lot harder: cars should park in different places every time." },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "Done. Parked cars now move to random spots and colors on every try, and I kept 16 copies of the lot for training.",
          },
        ],
        checks: [
          { text: "Random parked positions", tone: "ok" },
          { text: "Random car colors", tone: "ok" },
          { text: "16 copies for parallel training", tone: "ok" },
        ],
      },
    ],
  },
  "park-pilot-proposal": {
    autonomy: "ask",
    suggestions: worldChips,
    messages: [
      { id: "u1", role: "user", text: "Make it night time." },
      {
        id: "p1",
        role: "proposal",
        proposal: {
          id: "revision-15",
          revision: 15,
          intro: [
            { text: "Here is what I would change. Nothing changes until you apply it, and it becomes revision 15." },
          ],
          changes: [
            { kind: "diff", label: "Sky", from: "dusk", to: "night" },
            { kind: "diff", label: "Sun", from: "17:40", to: "21:30" },
            { kind: "diff", label: "Lamp posts", from: "none", to: "6 added" },
            { kind: "diff", label: "Headlights", from: "off", to: "on" },
          ],
          warnings: ["Night makes the sensors a bit noisier: ± 2 → ± 3 cm"],
          editable: true,
          status: "open",
        },
      },
    ],
  },
  "new-project": {
    autonomy: "ask",
    suggestions: starterChips,
    messages: [
      {
        id: "c1",
        role: "copilot",
        title: "Hi, what should we build?",
        text: [
          {
            text: "I can create the world, the agent and its goal for you, or you can start from the library or import your own model.",
          },
        ],
      },
    ],
  },
  "park-pilot-building": {
    autonomy: "ask",
    suggestions: [
      { text: "Make it night time", intent: "propose-change" },
      { text: "Use a bigger car", intent: "new-idea" },
    ],
    messages: [
      { id: "u1", role: "user", text: "A little car that learns to park itself in the free spot." },
      { id: "b1", role: "build", scene: "park-pilot-building" },
    ],
  },
  ideas: {
    autonomy: "ask",
    suggestions: [
      { text: "Make it at night", intent: "propose-change" },
      { text: "Use a bigger car", intent: "refine-ideas" },
      { text: "Show 3 more", intent: "refine-ideas" },
    ],
    messages: [
      { id: "u1", role: "user", text: "A little car that learns to park itself in the free spot." },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "Here are three ways to build it. They differ in the world, the sensors and how hard it is to learn. The first one trains fastest on your computer.",
          },
        ],
      },
    ],
  },
  "robot-arm": {
    autonomy: "ask",
    suggestions: [],
    messages: [
      { id: "u1", role: "user", text: "Give the gripper a sense of touch." },
      {
        id: "p1",
        role: "proposal",
        proposal: {
          id: "touch-sensors",
          intro: [
            { text: "I would add a " },
            { text: "Touch", strong: true },
            { text: " component to both fingers. The brain gets 2 new inputs, so it needs a little more training." },
          ],
          changes: [
            { kind: "add", text: "Gripper L · Touch · 0 … 20 N" },
            { kind: "add", text: "Gripper R · Touch · 0 … 20 N" },
          ],
          warnings: ["Brain inputs 14 → 16: retrain about 200k steps"],
          editable: false,
          status: "open",
        },
      },
    ],
  },
  ...BUILD_CONVERSATIONS,
  ...TRAINING_CONVERSATIONS,
  ...STUDIO_CONVERSATIONS,
};

// Conversations that only preview a proposal, and the workspace conversation it belongs to.
const PREVIEW_OF: Readonly<Record<string, string>> = { "park-pilot-proposal": "park-pilot" };

const EMPTY: Conversation = { autonomy: "ask", suggestions: [], messages: [] };

// In-memory conversations that behave: sending adds the message, applying or discarding settles the proposal.
export function createCopilotFixture(): CopilotPort {
  const conversations = new Map<string, Conversation>(Object.entries(CONVERSATIONS));
  // Attached files stay in memory with their text, shown from data URLs.
  const files = new Map<string, { attachment: ChatAttachment; text: string }>();
  let nextId = 1;
  const find = (key: string) => conversations.get(key) ?? EMPTY;
  const save = (key: string, conversation: Conversation) => {
    conversations.set(key, conversation);
    return conversation;
  };
  const settle = (key: string, id: string, status: ProposalStatus) => {
    const conversation = find(key);
    const messages = conversation.messages.map(
      (message): ChatMessage =>
        message.role === "proposal" && message.proposal.id === id
          ? { ...message, proposal: { ...message.proposal, status } }
          : message,
    );
    const settled = messages.filter((message) => message.role !== "copilot");
    const main = PREVIEW_OF[key];
    if (main) {
      // A previewed proposal is settled into the workspace conversation; the preview stays ready to show again.
      const target = find(main);
      save(main, { ...target, messages: [...target.messages, ...settled] });
      return conversation;
    }
    return save(key, { ...conversation, messages });
  };
  return {
    getConversation: async (key) => find(key),
    sendMessage: async ({ key, text, attachments = [], views = [] }) => {
      const conversation = find(key);
      const pick = (ids: readonly string[]) => ids.flatMap((id) => files.get(id)?.attachment ?? []);
      const attached = pick(attachments);
      const looked = pick(views);
      const sent: ChatMessage = {
        id: `sent-${nextId++}`,
        role: "user",
        text,
        ...(attached.length > 0 ? { attachments: attached } : {}),
        ...(looked.length > 0 ? { views: looked } : {}),
      };
      const reply: ChatMessage = {
        id: `reply-${nextId++}`,
        role: "copilot",
        text: [{ text: "I will prepare that change and show it to you before anything is applied." }],
      };
      return save(key, { ...conversation, messages: [...conversation.messages, sent, reply] });
    },
    applyProposal: async ({ key, id }) => settle(key, id, "applied"),
    discardProposal: async ({ key, id }) => settle(key, id, "discarded"),
    setAutonomy: async ({ key, mode }) => save(key, { ...find(key), autonomy: mode }),
    attachFile: async ({ kind, name, mediaType, data, frames = [], text = "" }) => {
      const pictured = kind === "image" || kind === "view" || kind === "video";
      const attachment: ChatAttachment = {
        id: `file-${nextId++}`,
        kind,
        name,
        mediaType,
        size: Math.floor((data.length * 3) / 4),
        url: pictured ? `data:${mediaType};base64,${data}` : null,
        poster: frames[0] ? `data:image/jpeg;base64,${frames[0]}` : null,
      };
      files.set(attachment.id, { attachment, text });
      return attachment;
    },
    readAttachmentText: async (id) => files.get(id)?.text ?? "",
    // Sample proposals have no compiled scene, so the preview draws no geoms.
    getPreview: async (key) => {
      const open = find(key).messages.find(
        (message) => message.role === "proposal" && message.proposal.status === "open",
      );
      return open?.role === "proposal" ? { id: open.proposal.id, revision: open.proposal.revision, geoms: [] } : null;
    },
  };
}
