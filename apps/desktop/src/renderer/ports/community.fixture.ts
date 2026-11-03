import type { CommunityPort, CreationAuthor, CreationDetail, CreationSummary } from "./community-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
function person(handle: string, initials: string, tone: CreationAuthor["tone"]): CreationAuthor {
  return { handle, initials, tone, name: handle, creations: 3 };
}

function creation(
  id: string,
  name: string,
  author: CreationAuthor,
  category: string,
  votes: number,
  remixes: number,
): CreationSummary {
  return { id, name, author, category, votes, remixes, opensIn: "page", picture: null };
}

const CREATIONS: readonly CreationSummary[] = [
  creation(
    "valet-bot",
    "Valet Bot",
    { ...person("mara", "MA", 1), name: "Mara Ortiz", creations: 12 },
    "Cars",
    2300,
    412,
  ),
  creation("stair-tripod", "Stair Tripod", person("kenji", "KE", 2), "Robots", 1800, 201),
  creation("salsa-dancer", "Salsa Dancer", person("lu", "LU", 3), "Humanoids", 1400, 330),
  creation("lot-swarm", "Lot Swarm", person("dev_ana", "DA", 4), "Worlds", 960, 88),
  creation("reverse-parker", "Reverse Parker", person("rob", "RO", 5), "Cars", 720, 64),
  creation("desk-walker", "Desk Walker", person("sam", "SA", 6), "Robots", 610, 52),
  creation("ballet-bot", "Ballet Bot", person("jin", "JI", 0), "Humanoids", 540, 97),
  creation("tight-spot", "Tight Spot", person("pau", "PA", 1), "Cars", 480, 31),
  { ...creation("fruit-fly", "Fruit Fly", person("neuro_ana", "NA", 0), "Insects", 3100, 520), opensIn: "brain" },
  creation("night-valet", "Night Valet", person("tomas", "TO", 1), "Cars", 390, 22),
  creation("hip-hop-copy", "Hip Hop Copy", person("rina", "RI", 2), "Humanoids", 350, 41),
  creation("ice-hopper", "Ice Hopper", person("geo", "GE", 3), "Robots", 300, 18),
];

const CATEGORIES = ["Cars", "Robots", "Humanoids", "Insects", "Worlds", "Brains only"];

const VALET_BOT: Omit<CreationDetail, keyof CreationSummary> = {
  tagline: "Car · parks 93% of the time · 4M steps",
  description:
    "A compact car that parks itself in tight spots using 8 distance sensors. Trained in 32 lots at once with random parked cars. Remix it to try your own lot layouts.",
  downloads: 5100,
  voted: false,
  included: ["World · parking lot", "Body · car with 8 sensors", "Brain · ONNX, 1.4 MB", "No code, safe to open"],
  license: "remix allowed, credit required",
  timelapseLength: "1:00",
  checkpoints: ["Start", "100k", "500k", "1M", "4M · 93%"],
  brain: ["Learned brain · 2 layers of 64", "Senses · 8 distance sensors and speed", "Actions · steer and throttle"],
  versions: [
    { label: "Revision 14", note: "Random parked cars in every lot" },
    { label: "Revision 9", note: "First version that parks" },
  ],
  comments: [
    {
      id: "kenji-truck",
      author: { handle: "kenji", initials: "KE", tone: 2 },
      text: "Remixed it with a truck, works after 1M more steps.",
    },
    {
      id: "lu-sensors",
      author: { handle: "lu", initials: "LU", tone: 3 },
      text: "How did you get the side sensors so stable?",
    },
  ],
  commentCount: 48,
};

function detailOf(summary: CreationSummary): CreationDetail {
  if (summary.id === "valet-bot") {
    return { ...summary, ...VALET_BOT };
  }
  return {
    ...summary,
    ...VALET_BOT,
    tagline: summary.category,
    description: "",
    downloads: 0,
    included: [],
    checkpoints: [],
    brain: [],
    versions: [],
    comments: [],
    commentCount: 0,
  };
}

export function createCommunityFixture(): CommunityPort {
  let details = new Map(CREATIONS.map((item) => [item.id, detailOf(item)]));
  const find = (id: string | undefined) => {
    const detail = details.get(id ?? "") ?? details.get(CREATIONS[0]?.id ?? "");
    if (!detail) {
      throw new Error("No creations yet");
    }
    return detail;
  };
  return {
    listCategories: async () => [...CATEGORIES],
    listCreations: async ({ sort, category, search, limit }) => {
      const needle = search.trim().toLowerCase();
      const ordered = sort === "recent" ? [...CREATIONS].reverse() : [...CREATIONS];
      return ordered
        .filter((item) => category === null || item.category === category)
        .filter((item) => needle === "" || `${item.name} ${item.author.handle}`.toLowerCase().includes(needle))
        .slice(0, limit);
    },
    getCreation: async (id) => find(id),
    vote: async (id) => {
      const detail = find(id);
      const voted = { ...detail, voted: !detail.voted, votes: detail.votes + (detail.voted ? -1 : 1) };
      details = new Map(details).set(voted.id, voted);
      return voted;
    },
    remix: async (id) => ({ projectId: `remix-${id}`, name: find(id).name }),
    report: async () => undefined,
    getPicture: async () => null,
  };
}
