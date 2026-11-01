import type { Idea, IdeaSet, IdeasPort } from "./ideas-port.ts";

// Sample ideas from the design, used only by the prototype, the design gallery and tests.
const IDEAS: readonly Idea[] = [
  {
    id: "classic",
    title: "Classic parking lot",
    world: "Open lot · 6 spots · random parked cars",
    body: "Compact car · 8 distance sensors",
    learns: "Drive into the free spot without touching",
    estimate: "about 40 min",
    recommended: true,
    scene: null,
  },
  {
    id: "street",
    title: "Street parallel parking",
    world: "Street · 2 parked cars · curb",
    body: "Compact car · 12 sensors",
    learns: "Reverse into a gap between cars",
    estimate: "about 1 h 10 min",
    recommended: false,
    scene: null,
  },
  {
    id: "camera",
    title: "Reverse with a camera",
    world: "Open lot · 6 spots",
    body: "Car · 8 sensors + rear camera",
    learns: "Back into the spot using the camera",
    estimate: "about 55 min",
    recommended: false,
    scene: null,
  },
];

const SET: IdeaSet = {
  id: "parking",
  ideas: IDEAS,
  mix: { worldFrom: "Street", bodyFrom: "Reverse with a camera" },
};

export function createIdeasFixture(): IdeasPort {
  return {
    generateIdeas: async () => SET,
    getIdeas: async () => SET,
    useIdea: async () => ({ build: "park-pilot-building" }),
    tweakIdea: async () => undefined,
    mixAndBuild: async () => undefined,
  };
}
