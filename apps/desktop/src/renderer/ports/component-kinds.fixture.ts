import type { ComponentGroup } from "./scene-port.ts";

// The components of the library as the design groups them, used only by the prototype, the design gallery and tests.
export const COMPONENT_GROUPS: readonly ComponentGroup[] = [
  {
    label: "Shape and look",
    kinds: [
      { id: "mesh", label: "Mesh", icon: "box" },
      { id: "material", label: "Material", icon: "material" },
      { id: "light", label: "Light", icon: "sun" },
    ],
  },
  {
    label: "Physics",
    kinds: [
      { id: "physics-body", label: "Physics body", icon: "physics" },
      { id: "collider", label: "Collider", icon: "collider" },
      { id: "joint", label: "Joint", icon: "joint" },
      { id: "motor", label: "Motor", icon: "motor" },
    ],
  },
  {
    label: "Senses",
    kinds: [
      { id: "distance-ray", label: "Distance ray", icon: "ray" },
      { id: "camera", label: "Camera", icon: "camera" },
      { id: "touch", label: "Touch", icon: "touch" },
      { id: "balance", label: "Balance (IMU)", icon: "balance" },
      { id: "smell", label: "Smell", icon: "smell" },
      { id: "sound", label: "Sound", icon: "sound" },
    ],
  },
  {
    label: "Brain",
    kinds: [
      { id: "learned-brain", label: "Learned brain", icon: "brain" },
      { id: "connectome", label: "Connectome", icon: "connectome" },
      { id: "community-brain", label: "From community", icon: "community" },
    ],
  },
  {
    label: "Learning",
    kinds: [
      { id: "goal", label: "Goal", icon: "goal" },
      { id: "reward-term", label: "Reward term", icon: "reward" },
      { id: "randomize", label: "Randomize per copy", icon: "shuffle" },
    ],
  },
  {
    label: "World",
    kinds: [
      { id: "spawn-point", label: "Spawn point", icon: "spawn" },
      { id: "zone", label: "Zone", icon: "zone" },
      { id: "wind", label: "Wind", icon: "wind" },
      { id: "water", label: "Water", icon: "water" },
    ],
  },
];
