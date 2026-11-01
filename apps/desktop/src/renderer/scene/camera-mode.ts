import { createContext } from "react";

// How a 3D view's camera moves: free orbit, chasing the agent, riding on it, or looking straight down.
export type CameraMode = "free" | "follow" | "onboard" | "top";

// The camera a view asks for; `frame` grows each time the whole scene should be framed again.
export type CameraView = { mode: CameraMode; frame: number; onFrameAll: () => void };

export const CAMERA_MODES: readonly { mode: CameraMode; label: string; hint: string }[] = [
  { mode: "free", label: "Free", hint: "Orbit, pan and zoom anywhere" },
  { mode: "follow", label: "Follow", hint: "Chase the agent from behind" },
  { mode: "onboard", label: "Onboard", hint: "See from the front of the agent" },
  { mode: "top", label: "Top", hint: "Look straight down on the scene" },
];

// Views where the agent moves start by following it; editing views start free.
export function defaultCameraMode(tab: string): CameraMode {
  return tab === "play" || tab === "replay" || tab === "live-training" ? "follow" : "free";
}

// The camera the surrounding viewport asks for; views outside a viewport (and the prototype) keep a fixed start.
export const CameraViewContext = createContext<CameraView | null>(null);
