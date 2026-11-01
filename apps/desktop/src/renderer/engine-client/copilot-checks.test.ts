import { describe, expect, it } from "vitest";
import { isConversation } from "./copilot-checks.ts";

const withAnswer = (answer: Record<string, unknown>) => ({
  project_id: "park",
  autonomy: "ask",
  suggestions: [],
  proposals: [],
  messages: [{ id: "m1", role: "copilot", text: "Done.", created_at: "2026-11-01T10:00:00Z", ...answer }],
});

describe("copilot conversation checks", () => {
  it("accepts answers with buttons and steps, and answers without them", () => {
    expect(isConversation(withAnswer({}))).toBe(true);
    expect(
      isConversation(
        withAnswer({
          actions: [
            { label: "Train", kind: "train" },
            { label: "Open Train", kind: "navigate", target: "SCR-TRAIN" },
          ],
          steps: [
            { tool: "look", summary: "Looked at the lot" },
            { tool: "try", summary: "Tried a change", ok: false },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("rejects buttons and steps the app could not act on", () => {
    expect(isConversation(withAnswer({ actions: [{ label: "Run", kind: "exec", target: "rm" }] }))).toBe(false);
    expect(isConversation(withAnswer({ actions: [{ kind: "send", target: "hi" }] }))).toBe(false);
    expect(isConversation(withAnswer({ actions: [{ label: "Go", kind: "navigate", target: 3 }] }))).toBe(false);
    expect(isConversation(withAnswer({ steps: [{ tool: "shell", summary: "Ran it" }] }))).toBe(false);
    expect(isConversation(withAnswer({ steps: [{ tool: "look", summary: "Looked", ok: "yes" }] }))).toBe(false);
    expect(isConversation(withAnswer({ steps: "looked" }))).toBe(false);
  });
});
