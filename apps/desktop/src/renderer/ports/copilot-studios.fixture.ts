import type { Conversation } from "./copilot-port.ts";

// Sample conversations of the brain, body and motion workspaces from the design, used only by the prototype, the gallery and tests.

const networkChips = [
  { text: "Make the brain bigger", intent: "resize-brain" },
  { text: "Compare with 25k", intent: "compare" },
  { text: "What does layer 1 do?", intent: "explain" },
] as const;

const flyActions = [
  { text: "Play with it", intent: "play" },
  { text: "Compare with real flies", intent: "compare" },
] as const;

export const STUDIO_CONVERSATIONS: Readonly<Record<string, Conversation>> = {
  "park-pilot-brain": {
    autonomy: "ask",
    suggestions: [
      { text: "Explain the reward", intent: "explain" },
      { text: "Make it faster", intent: "resize-brain" },
      { text: "Reset to default", intent: "propose-change" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Why is touching cars only 0.2?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "It was low so it would dare to get close at the start. Now that it parks 71% of the time, a bigger penalty teaches it to be careful. I raised it to ",
          },
          { text: "1.0", strong: true },
          { text: " and added two side sensors." },
        ],
        checks: [
          { text: "Penalty for touching cars 0.2 → 1.0", tone: "ok" },
          { text: "Side sensors added to what it sees", tone: "ok" },
        ],
      },
    ],
  },
  "park-pilot-network": {
    autonomy: "ask",
    suggestions: networkChips,
    messages: [
      { id: "u1", role: "user", text: "What is the brain thinking right now?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "The front-left sensor sees a car 0.6 m away, so the neurons that track the left side light up. That pushes ",
          },
          { text: "Steer", strong: true },
          { text: " to the right and lowers " },
          { text: "Throttle", strong: true },
          { text: "." },
        ],
        checks: [
          { text: "Neuron 2·41 fires when a car is close on the left", tone: "ok" },
          { text: "Neuron 2·12 fires near the free spot", tone: "ok" },
        ],
      },
    ],
  },
  "fruit-fly": {
    autonomy: "ask",
    suggestions: flyActions,
    messages: [
      { id: "u1", role: "user", text: "Put the real fly brain into the fly body and see if it acts like a fly." },
      {
        id: "c1",
        role: "copilot",
        text: [
          { text: "I loaded the " },
          { text: "FlyWire connectome", strong: true },
          {
            text: " into the fly body. Nothing was trained: the real wiring drives the body. I only matched its motor neurons to the leg and wing joints.",
          },
        ],
        checks: [
          { text: "Walks to sugar with a tripod gait", tone: "ok" },
          { text: "Turns away from a looming shadow", tone: "ok" },
          { text: "Starts grooming later than real flies", tone: "warn" },
        ],
        actions: flyActions,
      },
    ],
  },
  "dance-copy-body": {
    autonomy: "ask",
    suggestions: [
      { text: "Make it lighter", intent: "propose-change" },
      { text: "Stiffer knees", intent: "propose-change" },
      { text: "Copy this video", intent: "motion-video" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Here is my character. Make it dance like this video." },
      {
        id: "c1",
        role: "copilot",
        text: [{ text: "I imported " }, { text: "dancer.glb", strong: true }, { text: " and rigged it for physics:" }],
        checks: [
          { text: "19 bones placed and named", tone: "ok" },
          { text: "17 motors, strength from body size", tone: "ok" },
          { text: "Masses estimated, 64 kg total", tone: "ok" },
          { text: "Hands have no colliders yet", tone: "warn" },
        ],
        actions: [
          { text: "Add hand colliders", intent: "apply-fix" },
          { text: "Show me", intent: "show" },
        ],
      },
    ],
  },
  "dance-copy-import": {
    autonomy: "ask",
    suggestions: [
      { text: "Import a robot", intent: "import" },
      { text: "Use a template", intent: "template" },
    ],
    messages: [
      { id: "u1", role: "user", text: "I have my own character model, can I use it?" },
      {
        id: "c1",
        role: "copilot",
        text: [{ text: "Yes. Drop it in the import window and I will rig it for physics and check it can stand." }],
      },
    ],
  },
  "dance-copy-motion": {
    autonomy: "ask",
    suggestions: [
      { text: "Slow it down", intent: "propose-change" },
      { text: "Loop it", intent: "export" },
      { text: "Export for Roblox", intent: "export" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Make my dancer copy this salsa video." },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "I tracked the dancer in all 360 frames and mapped the pose onto your character. With real physics it matches ",
          },
          { text: "87%", strong: true },
          { text: " of the moves." },
        ],
        checks: [
          { text: "Pose found in every frame", tone: "ok" },
          { text: "Feet stay on the floor", tone: "ok" },
          { text: "The spin at 0:07 loses balance", tone: "warn" },
        ],
        actions: [{ text: "Train the spin", intent: "train-run" }],
      },
    ],
  },
};
