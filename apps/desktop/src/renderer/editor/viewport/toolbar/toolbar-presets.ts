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
    { label: "Terrain", icon: Mountain },
    { label: "Paint", icon: Paintbrush },
    { label: "Props", icon: Box },
  ],
  [
    { label: "Sky", icon: Cloud },
    { label: "Light", icon: Sun },
    { label: "Camera", icon: Video },
  ],
  [
    { label: "Copies", icon: Copy, to: "POP-TRAINING-COPIES" },
    { label: "Randomize", icon: Shuffle, to: "POP-TRAINING-COPIES" },
  ],
  [{ label: "Import world", icon: Upload, to: "MOD-IMPORT" }],
];

// While the copilot builds the world only the basic environment tools are available.
export const WORLD_BUILDING_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Terrain", icon: Mountain },
    { label: "Sky", icon: Cloud },
    { label: "Light", icon: Sun },
  ],
];

export const NEW_PROJECT_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Terrain", icon: Mountain },
    { label: "Sky", icon: Cloud },
    { label: "Light", icon: Sun },
  ],
  [
    { label: "Part", icon: Box },
    { label: "Agent", icon: PersonStanding, to: "SCR-IDEAS" },
    { label: "Goal", icon: Target, to: "SCR-BRAIN" },
  ],
  [{ label: "Import", icon: Upload, to: "MOD-IMPORT" }],
];

export const BODY_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Import", icon: Upload, to: "MOD-IMPORT" },
    { label: "Auto-rig", icon: Sparkles, to: "MOD-AUTO-RIG" },
  ],
  [
    { label: "Bone", icon: Bone },
    { label: "Joint", icon: Orbit },
    { label: "Motor", icon: Cog },
    { label: "Sensor", icon: Radar },
  ],
  [
    { label: "Mirror", icon: Columns2 },
    { label: "Collider", icon: SquareDashed },
    { label: "Weights", icon: Dumbbell },
  ],
  [{ label: "Test pose", icon: PersonStanding }],
];

export const BRAIN_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Senses", icon: Radar },
    { label: "Network", icon: Network, to: "STA-BRAIN-NETWORK" },
  ],
];

export const TRAIN_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Train", icon: Play },
    { label: "Pause", icon: Pause, to: "MOD-STOP-RUN" },
    { label: "Stop", icon: Square },
  ],
  [{ label: "Timelapse", icon: Film, to: "SCR-TIMELAPSE" }],
  [{ label: "Autopilot", icon: Sparkles, to: "MOD-AUTOPILOT" }],
];

export const MOTION_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Video", icon: Video, to: "MOD-MOTION-VIDEO" },
    { label: "Detect pose", icon: ScanLine, to: "MOD-MOTION-TRACKING" },
    { label: "Retarget", icon: Bone },
  ],
  [{ label: "Trim", icon: Scissors }],
  [{ label: "Export", icon: Upload, to: "MOD-EXPORT-ANIMATION" }],
];
