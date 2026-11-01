import type { Conversation } from "./copilot-port.ts";

// Sample Build workspace conversations from the design, used only by the prototype, the design gallery and tests.
export const BUILD_CONVERSATIONS: Readonly<Record<string, Conversation>> = {
  "park-pilot-build": {
    autonomy: "ask",
    suggestions: [
      { text: "Write a better description", intent: "propose-change" },
      { text: "Export for Unity", intent: "export-brain" },
      { text: "Order the parts", intent: "order-parts" },
    ],
    messages: [
      { id: "u1", role: "user", text: "I want to share it, and maybe build it with a real RC car." },
      {
        id: "c1",
        role: "copilot",
        text: [
          { text: "I filled the community page for you. For a real car you need four parts, about " },
          { text: "$189", strong: true },
          { text: ". Its brain is 1.2 MB and runs at 30 Hz on a Raspberry Pi 5." },
        ],
        checks: [
          { text: "Community page ready to publish", tone: "ok" },
          { text: "Parts list matched to your sensors", tone: "ok" },
          { text: "Real cars slide more: train 200k more steps with noise", tone: "warn" },
        ],
      },
    ],
  },
  "park-pilot-hardware": {
    autonomy: "ask",
    suggestions: [
      { text: "Explain calibration", intent: "explain" },
      { text: "Order the parts", intent: "order-parts" },
    ],
    messages: [
      { id: "u1", role: "user", text: "The right side sensor shows no data." },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "Its reading never changes, so the cable on port 5 is probably loose. Reseat it and press Recheck. You can also skip it: the brain still works with 7 sensors, a bit less precisely.",
          },
        ],
      },
    ],
  },
};
