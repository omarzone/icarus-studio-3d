import type { Conversation, CopilotProposal, SceneDescription, SceneGeom, SendMessage } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { EngineError } from "../engine-client/request.ts";
import { CopilotNotConnected } from "./copilot-connection.ts";
import { createEngineCopilot } from "./copilot-engine.ts";

const proposal: CopilotProposal = {
  id: "p1",
  project_id: "park",
  base_revision: 2,
  summary: "Add a lamp",
  explanation: "",
  operations: [{ op: "rename_project", name: "Park" }],
  changes: [{ label: "Lamp post", after: "added" }],
  warnings: [],
  status: "open",
};

const conversation = (proposals: CopilotProposal[] = []): Conversation => ({
  project_id: "park",
  autonomy: "ask",
  suggestions: [],
  messages: [],
  proposals,
});

const geom = (name: string, x = 0): SceneGeom => ({
  name,
  body: "world",
  shape: "box",
  color: "#808080",
  size: [1, 1, 1],
  position: [x, 0, 0],
  quaternion: [1, 0, 0, 0],
});

const scene = (geoms: SceneGeom[]): SceneDescription => ({ revision: 2, bodies: [], lights: [], geoms });

function engine(current: Conversation = conversation()) {
  const sent: { id: string; body: SendMessage }[] = [];
  const api = {
    conversation: vi.fn(async () => current),
    sendMessage: vi.fn(async (id: string, body: SendMessage) => {
      sent.push({ id, body });
      return current;
    }),
    setAutonomy: vi.fn(async () => ({ ...current, autonomy: "autopilot" as const })),
    applyProposal: vi.fn(async () => current),
    discardProposal: vi.fn(async () => current),
    proposalScene: vi.fn(async () => scene([geom("floor"), geom("lamp")])),
    scene: vi.fn(async () => scene([geom("floor")])),
  };
  return { copilot: createEngineCopilot(api), api, sent };
}

describe("copilot on the engine", () => {
  it("talks to the conversation of the project the key names, with where the user is", async () => {
    const { copilot, sent } = engine();
    await copilot.sendMessage({ key: "park", text: "make it night", selection: "car", workspace: "World" });
    expect(sent).toEqual([{ id: "park", body: { text: "make it night", selection: "car", workspace: "World" } }]);
  });

  it("sends the autonomy mode the user picked", async () => {
    const { copilot, api } = engine();
    expect((await copilot.setAutonomy({ key: "park", mode: "autopilot" })).autonomy).toBe("autopilot");
    expect(api.setAutonomy).toHaveBeenCalledWith("park", { autonomy: "autopilot" });
  });

  it("previews only what the open proposal adds or changes", async () => {
    const { copilot } = engine(conversation([proposal]));
    const preview = await copilot.getPreview("park");
    expect(preview?.id).toBe("p1");
    expect(preview?.revision).toBe(3);
    expect(preview?.geoms.map((item) => item.name)).toEqual(["lamp"]);
  });

  it("has no preview when nothing waits for an answer", async () => {
    const { copilot, api } = engine(conversation([{ ...proposal, status: "applied", applied_revision: 3 }]));
    expect(await copilot.getPreview("park")).toBeNull();
    expect(api.proposalScene).not.toHaveBeenCalled();
  });

  it("tells the views when no model is connected", async () => {
    const { copilot, api } = engine();
    api.conversation.mockRejectedValueOnce(new EngineError("not_connected", "Connect a model"));
    await expect(copilot.getConversation("park")).rejects.toBeInstanceOf(CopilotNotConnected);
  });
});
