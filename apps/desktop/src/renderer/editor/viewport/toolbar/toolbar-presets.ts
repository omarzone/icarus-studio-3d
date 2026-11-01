import {
  Bone,
  Box,
  Cloud,
  Cog,
  Columns2,
  Copy,
  Dumbbell,
  Film,
  Mountain,
  Network,
  Orbit,
  Paintbrush,
  Pause,
  PersonStanding,
  Play,
  Radar,
  ScanLine,
  Scissors,
  Shuffle,
  Sparkles,
  Square,
  SquareDashed,
  Sun,
  Target,
  Upload,
  Video,
} from "lucide-react";
import type { ToolGroup } from "./toolbar.tsx";

// Tool groups of each workspace (catalog PNL-TOOLBAR). Workspaces pass one of these to the toolbar.

export const WORLD_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Terrain", icon: Mountain, hint: "Shape the ground it moves on" },
    { label: "Paint", icon: Paintbrush, hint: "Choose the material and colour of a surface" },
    { label: "Props", icon: Box, hint: "Place ready-made objects in the world" },
  ],
  [
    { label: "Sky", icon: Cloud, hint: "Change the sky and the time of day" },
    { label: "Light", icon: Sun, hint: "Change the sun and the lights" },
    { label: "Camera", icon: Video, hint: "Set the camera the game view looks through" },
  ],
  [
    {
      label: "Copies",
      icon: Copy,
      to: "POP-TRAINING-COPIES",
      hint: "Set how many copies of the world it practices in at once",
    },
    {
      label: "Randomize",
      icon: Shuffle,
      to: "POP-TRAINING-COPIES",
      hint: "Make each practice copy a little different, so it learns to cope",
    },
  ],
  [{ label: "Import world", icon: Upload, to: "MOD-IMPORT", hint: "Bring in an environment from a 3D file" }],
];

// While the copilot builds the world only the basic environment tools are available.
export const WORLD_BUILDING_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Terrain", icon: Mountain, hint: "Shape the ground it moves on" },
    { label: "Sky", icon: Cloud, hint: "Change the sky and the time of day" },
    { label: "Light", icon: Sun, hint: "Change the sun and the lights" },
  ],
];

export const NEW_PROJECT_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Terrain", icon: Mountain, hint: "Shape the ground it moves on" },
    { label: "Sky", icon: Cloud, hint: "Change the sky and the time of day" },
    { label: "Light", icon: Sun, hint: "Change the sun and the lights" },
  ],
  [
    { label: "Part", icon: Box, hint: "Add a basic shape to the world" },
    { label: "Agent", icon: PersonStanding, to: "SCR-IDEAS", hint: "Add something that learns" },
    { label: "Goal", icon: Target, to: "SCR-BRAIN", hint: "Add the place it should reach" },
  ],
  [{ label: "Import", icon: Upload, to: "MOD-IMPORT", hint: "Bring in a model, robot or environment from a file" }],
];

export const BODY_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Import", icon: Upload, to: "MOD-IMPORT", hint: "Bring in a model, robot or environment from a file" },
    { label: "Auto-rig", icon: Sparkles, to: "MOD-AUTO-RIG", hint: "Find the bones and joints of an imported model" },
  ],
  [
    { label: "Bone", icon: Bone, hint: "Add or edit the bones of the body" },
    { label: "Joint", icon: Orbit, hint: "Connect two parts so they can turn" },
    { label: "Motor", icon: Cog, hint: "Make a joint move on its own" },
    { label: "Sensor", icon: Radar, hint: "Add a sense, like distance rays or touch" },
  ],
  [
    { label: "Mirror", icon: Columns2, hint: "Copy one side of the body to the other" },
    { label: "Collider", icon: SquareDashed, hint: "Edit the shapes that touch the world" },
    { label: "Weights", icon: Dumbbell, hint: "Edit how the skin follows the bones" },
  ],
  [{ label: "Test pose", icon: PersonStanding, hint: "Put the body in a pose to check it" }],
];

export const BRAIN_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Senses", icon: Radar, hint: "Show what the brain senses" },
    { label: "Network", icon: Network, to: "STA-BRAIN-NETWORK", hint: "See the brain as a network of layers" },
  ],
];

export const TRAIN_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Train", icon: Play, hint: "Start practice: choose steps and copies, then it learns" },
    { label: "Pause", icon: Pause, to: "MOD-STOP-RUN", hint: "Pause or stop the run that is training" },
    { label: "Stop", icon: Square, hint: "Stop the run that is training; the best brain is kept" },
  ],
  [{ label: "Timelapse", icon: Film, to: "SCR-TIMELAPSE", hint: "Watch how it learned, from first try to best brain" }],
  [{ label: "Autopilot", icon: Sparkles, to: "MOD-AUTOPILOT", hint: "Let the copilot fix problems while it trains" }],
];

export const MOTION_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Video", icon: Video, to: "MOD-MOTION-VIDEO", hint: "Choose a video of the movement to copy" },
    {
      label: "Detect pose",
      icon: ScanLine,
      to: "MOD-MOTION-TRACKING",
      hint: "Track the person in the video frame by frame",
    },
    { label: "Retarget", icon: Bone, hint: "Map the tracked movement onto the body" },
  ],
  [{ label: "Trim", icon: Scissors, hint: "Keep only part of the clip" }],
  [{ label: "Export", icon: Upload, to: "MOD-EXPORT-ANIMATION", hint: "Save the animation as a file" }],
];
