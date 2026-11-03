import type { Conversation, CopilotProposal, SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import {
  changedGeoms,
  conversationView,
  openProposal,
  proposalView,
  runCardProgress,
  workspaceOf,
} from "./copilot-views.ts";

const night: CopilotProposal = {
  id: "p1",
  project_id: "park",
  base_revision: 4,
  summary: "Make it night",
  explanation: "I dim the sun so the lot is dark.",
  operations: [
    {
      op: "set_property",
      object: "sun",
      component: "light",
      property: "intensity",
      value: { type: "slider", value: 0.1 },
    },
  ],
  changes: [
    { label: "Sun brightness on World", before: "1", after: "0.1" },
    { label: "Lamp post", after: "added" },
  ],
  warnings: ["Sensors get noisier at night"],
  status: "open",
};

const conversation = (proposals: CopilotProposal[]): Conversation => ({
  project_id: "park",
  autonomy: "ask",
  suggestions: ["Add rain", "Why is it dark?"],
  proposals,
  messages: [
    { id: "m1", role: "user", text: "make it night", created_at: "2026-11-01T10:00:00Z" },
    {
      id: "m2",
      role: "copilot",
      text: "Here is a darker lot.",
      created_at: "2026-11-01T10:00:02Z",
      proposal_id: "p1",
      thinking: "The light component has an intensity.",
    },
  ],
});

const geom = (name: string, change: Partial<SceneGeom> = {}): SceneGeom => ({
  name,
  body: "world",
  shape: "box",
  color: "#808080",
  size: [1, 1, 1],
  position: [0, 0, 0],
  quaternion: [1, 0, 0, 0],
  ...change,
});

describe("copilot conversation views", () => {
  it("shows each answer with its thinking, followed by the proposal it made", () => {
    const view = conversationView(conversation([night]));
    expect(view.messages.map((message) => message.role)).toEqual(["user", "copilot", "proposal"]);
    expect(view.messages[1]).toEqual({
      id: "m2",
      role: "copilot",
      text: [{ text: "Here is a darker lot." }],
      markdown: "Here is a darker lot.",
      thinking: "The light component has an intensity.",
    });
    expect(view.autonomy).toBe("ask");
  });

  it("carries an answer's buttons, the steps the copilot took and what it saw", () => {
    const links = {
      content: (id: string) => `http://engine/attachments/${id}/content`,
      frame: (id: string, n: number) => `http://engine/attachments/${id}/frames/${n}`,
    };
    const engine: Conversation = {
      ...conversation([{ ...night, status: "applied", applied_revision: 5 }]),
      messages: [
        {
          id: "m2",
          role: "copilot",
          text: "Done.",
          created_at: "2026-11-01T10:00:02Z",
          proposal_id: "p1",
          actions: [
            { label: "Apply", kind: "apply" },
            { label: "See it train", kind: "navigate", target: "SCR-TRAIN" },
          ],
          steps: [
            { tool: "look", summary: "Looked at the lot from above" },
            { tool: "try", summary: "Tried 2 changes: placement check failed", ok: false },
          ],
          attachments: [{ id: "v1", kind: "view", name: "Top view", media_type: "image/png", size: 30 }],
        },
      ],
    };
    const [message] = conversationView(engine, links).messages;
    expect(message).toMatchObject({
      role: "copilot",
      answerActions: [
        { label: "Apply", kind: "apply", target: null },
        { label: "See it train", kind: "navigate", target: "SCR-TRAIN" },
      ],
      steps: [
        { tool: "look", summary: "Looked at the lot from above", ok: true },
        { tool: "try", summary: "Tried 2 changes: placement check failed", ok: false },
      ],
      views: [{ id: "v1", kind: "view", url: "http://engine/attachments/v1/content" }],
      proposal: { id: "p1", open: false },
    });
  });

  it("turns suggestions into chips that send their own text", () => {
    expect(conversationView(conversation([night])).suggestions).toEqual([
      { text: "Add rain", intent: "ask" },
      { text: "Why is it dark?", intent: "ask" },
    ]);
  });

  it("shows the files a message carries apart from the scene renders taken for it, served by the engine", () => {
    const links = {
      content: (id: string) => `http://engine/attachments/${id}/content`,
      frame: (id: string, n: number) => `http://engine/attachments/${id}/frames/${n}`,
    };
    const engine: Conversation = {
      ...conversation([]),
      messages: [
        {
          id: "m1",
          role: "user",
          text: "like this",
          created_at: "2026-11-01T10:00:00Z",
          attachments: [
            { id: "a1", kind: "image", name: "lot.png", media_type: "image/png", size: 10 },
            { id: "a2", kind: "video", name: "run.mp4", media_type: "video/mp4", size: 20 },
            { id: "v1", kind: "view", name: "Three-quarter view", media_type: "image/jpeg", size: 30 },
          ],
        },
      ],
    };
    const [message] = conversationView(engine, links).messages;
    expect(message).toEqual({
      id: "m1",
      role: "user",
      text: "like this",
      attachments: [
        {
          id: "a1",
          kind: "image",
          name: "lot.png",
          mediaType: "image/png",
          size: 10,
          url: "http://engine/attachments/a1/content",
          poster: null,
        },
        {
          id: "a2",
          kind: "video",
          name: "run.mp4",
          mediaType: "video/mp4",
          size: 20,
          url: "http://engine/attachments/a2/content",
          poster: "http://engine/attachments/a2/frames/0",
        },
      ],
      views: [
        {
          id: "v1",
          kind: "view",
          name: "Three-quarter view",
          mediaType: "image/jpeg",
          size: 30,
          url: "http://engine/attachments/v1/content",
          poster: null,
        },
      ],
    });
  });

  it("carries an answer's title and check list", () => {
    const engine: Conversation = {
      ...conversation([]),
      messages: [
        {
          id: "m1",
          role: "copilot",
          text: "The car is ready.",
          created_at: "2026-11-01T10:00:00Z",
          title: "Body checks",
          checks: [
            { text: "Wheels touch the ground", tone: "ok" },
            { text: "Sensors see only the front", tone: "warn" },
          ],
        },
      ],
    };
    expect(conversationView(engine).messages[0]).toMatchObject({
      role: "copilot",
      title: "Body checks",
      checks: [
        { text: "Wheels touch the ground", tone: "ok" },
        { text: "Sensors see only the front", tone: "warn" },
      ],
    });
  });

  it("follows an answer with its build, its run and its plan, and marks each new milestone once", () => {
    const at = "2026-11-01T10:00:00Z";
    const engine: Conversation = {
      ...conversation([]),
      messages: [
        { id: "m1", role: "copilot", text: "Building.", created_at: at, build_id: "b1" },
        { id: "m2", role: "copilot", text: "Training.", created_at: at, run: { run_id: "r1" } },
        {
          id: "m3",
          role: "copilot",
          text: "It turns too late.",
          created_at: at,
          run: { run_id: "r1", milestone_step: 100000 },
          plan: [{ mark: "add", label: "Side sensors", detail: "2 rays" }],
        },
        { id: "m4", role: "copilot", text: "Better.", created_at: at, run: { run_id: "r1", milestone_step: 100000 } },
        { id: "m5", role: "copilot", text: "Done.", created_at: at, run: { run_id: "r1", milestone_step: 1500000 } },
      ],
    };
    const view = conversationView(engine).messages;
    expect(view.map((message) => message.role)).toEqual([
      "copilot",
      "build",
      "copilot",
      "run",
      "milestone",
      "copilot",
      "run",
      "plan",
      "copilot",
      "run",
      "milestone",
      "copilot",
      "run",
    ]);
    expect(view[1]).toEqual({ id: "build-m1", role: "build", scene: "b1" });
    expect(view[3]).toEqual({ id: "run-m2", role: "run", runId: "r1" });
    expect(view[4]).toEqual({ id: "milestone-m3", role: "milestone", text: "100k steps" });
    expect(view[7]).toEqual({
      id: "plan-m3",
      role: "plan",
      plan: {
        title: "Next run, if you agree",
        items: [{ mark: "add", label: "Side sensors", detail: "2 rays" }],
        actions: [],
      },
    });
    expect(view[10]).toMatchObject({ role: "milestone", text: "1.5M steps" });
  });

  it("uses suggestion intents when the engine sends them", () => {
    const engine: Conversation = {
      ...conversation([]),
      suggestion_items: [{ text: "Show where it fails", intent: "diagnose" }, { text: "Why?" }],
    };
    expect(conversationView(engine).suggestions).toEqual([
      { text: "Show where it fails", intent: "diagnose" },
      { text: "Why?", intent: "ask" },
    ]);
  });

  it("carries the coach's film strip served by the engine and each finding with the state of its fix", () => {
    const links = {
      content: (id: string) => `http://engine/attachments/${id}/content`,
      frame: (id: string, n: number) => `http://engine/attachments/${id}/frames/${n}`,
    };
    const engine: Conversation = {
      ...conversation([night]),
      messages: [
        {
          id: "m1",
          role: "copilot",
          text: "It crawls.",
          created_at: "2026-11-01T10:00:00Z",
          film_strip: {
            step: 50_000,
            episode: 1,
            interval: 1.5,
            frames: [
              { attachment_id: "f0", time: 0 },
              { attachment_id: "f1", time: 1.5, failure: true },
            ],
          },
          findings: [
            { area: "reward", behavior: "Crawls on its knees", change: "Pay body_height", proposal_id: "p1" },
            { area: "body", behavior: "Drags a leg", change: "Widen the knee range" },
          ],
        },
      ],
    };
    const [message] = conversationView(engine, links).messages;
    if (message?.role !== "copilot") {
      throw new Error("expected a copilot answer");
    }
    expect(message.filmStrip?.frames.map((frame) => [frame.picture.url, frame.time, frame.failure])).toEqual([
      ["http://engine/attachments/f0/content", 0, false],
      ["http://engine/attachments/f1/content", 1.5, true],
    ]);
    expect(message.findings).toEqual([
      {
        area: "reward",
        behavior: "Crawls on its knees",
        change: "Pay body_height",
        proposal: { id: "p1", status: "open" },
      },
      { area: "body", behavior: "Drags a leg", change: "Widen the knee range", proposal: null },
    ]);
  });

  it("leaves out a proposal the conversation no longer has", () => {
    const view = conversationView(conversation([]));
    expect(view.messages.map((message) => message.role)).toEqual(["user", "copilot"]);
  });
});

describe("run card", () => {
  it("shows the share done while the run trains", () => {
    expect(runCardProgress({ id: "r1", name: "Run 3", status: "running", progress: 0.42, detail: "" })).toEqual({
      title: "Run 3",
      meta: "training",
      done: 0.42,
      goals: [],
    });
  });

  it("shows the result once it ended", () => {
    expect(runCardProgress({ id: "r1", name: "Run 3", status: "done", detail: "parks 71%" })).toMatchObject({
      meta: "parks 71%",
      done: 1,
    });
  });
});

describe("proposal view", () => {
  it("lists before → after differences, additions and side effects", () => {
    const view = proposalView(night);
    expect(view.changes).toEqual([
      { kind: "diff", label: "Sun brightness on World", from: "1", to: "0.1" },
      { kind: "add", text: "Lamp post · added" },
    ]);
    expect(view.warnings).toEqual(["Sensors get noisier at night"]);
    expect(view.intro).toEqual([
      { text: "Make it night.", strong: true },
      { text: " I dim the sun so the lot is dark." },
    ]);
    expect(view.editable).toBe(false);
  });

  it("names the revision it becomes: the next one while open, the real one once applied", () => {
    expect(proposalView(night).revision).toBe(5);
    expect(proposalView({ ...night, status: "applied", applied_revision: 7 }).revision).toBe(7);
    expect(proposalView({ ...night, status: "outdated" }).revision).toBeUndefined();
  });

  it("keeps the engine's status, including outdated", () => {
    expect(proposalView({ ...night, status: "outdated" }).status).toBe("outdated");
  });

  it("finds the proposal still waiting for an answer", () => {
    expect(openProposal(conversation([{ ...night, status: "applied" }]))).toBeUndefined();
    expect(openProposal(conversation([night]))?.id).toBe("p1");
  });
});

describe("proposal preview geoms", () => {
  it("keeps only geoms the proposal adds or changes", () => {
    const current = [geom("floor"), geom("car"), geom("old")];
    const proposed = [
      geom("floor"),
      geom("car", { position: [1, 0, 0] }),
      geom("lamp"),
      geom("old", { color: "#000000" }),
    ];
    expect(changedGeoms(current, proposed).map((item) => item.name)).toEqual(["car", "lamp", "old"]);
  });

  it("ignores differences below what the eye can see", () => {
    expect(changedGeoms([geom("car")], [geom("car", { position: [1e-9, 0, 0] })])).toEqual([]);
  });
});

describe("workspace of a screen", () => {
  it("names the workspace the user is in from the screen id", () => {
    expect(workspaceOf("SCR-WORLD")).toBe("World");
    expect(workspaceOf("STA-WORLD-PROPOSAL")).toBe("World");
    expect(workspaceOf("STA-TRAIN-FAILED")).toBe("Train");
    expect(workspaceOf("MOD-HISTORY")).toBeUndefined();
  });
});
