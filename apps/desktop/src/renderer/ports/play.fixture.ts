import type { CompoundEye, PlayPort, PlaySession, PlayTool } from "./play-port.ts";

// Sample Play sessions from the design (a learned car brain and a connectome fly), for the prototype and tests only.
const tool = (id: PlayTool["id"], label: string): PlayTool => ({ id, label });

// A compound eye as rows of facets; a dark patch where the shadow falls.
function eye(label: string, shadowColumn: number): CompoundEye {
  const rows = 7;
  const columns = 9;
  const cells = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const distance = Math.hypot(column - shadowColumn, (row - 3) * 1.2);
    const shade = Math.min(1, distance / 3);
    return Math.round((0.25 + 0.7 * shade - ((row + column) % 3) * 0.06) * 100) / 100;
  });
  return { label, rows, columns, cells };
}

const SESSIONS: Readonly<Record<string, PlaySession>> = {
  "park-pilot": {
    views: ["Play", "Agent view"],
    tools: [
      tool("move", "Move"),
      tool("push", "Push"),
      tool("add-object", "Add object"),
      tool("light", "Light"),
      tool("shuffle", "Shuffle"),
      tool("slow", "Slow"),
      tool("reset", "Reset"),
    ],
    selectedTool: "move",
    speed: "1×",
    status: { title: "You moved a parked car", detail: "It saw it at 0.4 m and is backing up to try again" },
    senses: {
      bars: [
        { id: "front-l", label: "Front L", ratio: 0.14, display: "0.4 m", tone: "danger" },
        { id: "front", label: "Front", ratio: 0.64, display: "2.1 m", tone: "default" },
        { id: "front-r", label: "Front R", ratio: 0.8, display: "2.6 m", tone: "default" },
        { id: "side-l", label: "Side L", ratio: 0.3, display: "0.9 m", tone: "default" },
        { id: "rear", label: "Rear", ratio: 0.92, display: "3.0 m", tone: "default" },
      ],
    },
    decisions: {
      bars: [
        { id: "steer", label: "Steer", ratio: 0.7, display: "14° R", tone: "default" },
        { id: "throttle", label: "Throttle", ratio: 0.22, display: "0.2", tone: "default" },
        { id: "brake", label: "Brake", ratio: 0.6, display: "0.6", tone: "default" },
      ],
      brain: "Brain: run 3 · checkpoint 312k",
    },
    events: [
      { time: "0:01", text: "Started in the lot entrance" },
      { time: "0:03", text: "You moved the white car into its path" },
      { time: "0:04", text: "Front L sensor at 0.4 m: braked and steered right" },
      { time: "0:07", text: "Backing up to try a wider turn" },
    ],
  },
  "fruit-fly": {
    views: ["Play", "Game view"],
    tools: [
      tool("move", "Move"),
      tool("push", "Push"),
      tool("add-object", "Add object"),
      tool("light", "Light"),
      tool("wind", "Wind"),
      tool("shadow", "Shadow"),
      tool("scent", "Scent"),
      tool("slow", "Slow"),
      tool("reset", "Reset"),
    ],
    selectedTool: "add-object",
    speed: "1×",
    placing: "Click to place: Sugar",
    status: { title: "Real wiring · no training", detail: "0:09 · walking to the sugar you dropped" },
    senses: {
      bars: [
        { id: "smell", label: "Smell sugar", icon: "smell", ratio: 0.78, display: "78%", tone: "warn" },
        { id: "hunger", label: "Hunger", icon: "hunger", ratio: 0.64, display: "64%", tone: "warn" },
        { id: "light-l", label: "Light left", icon: "light", ratio: 0.62, display: "62%", tone: "default" },
        { id: "light-r", label: "Light right", icon: "light", ratio: 0.4, display: "40%", tone: "default" },
        { id: "antennas", label: "Antennas", icon: "antenna", ratio: 0.12, display: "12%", tone: "default" },
        { id: "touch", label: "Touch", icon: "touch", ratio: 0, display: "0%", tone: "default" },
        { id: "wind", label: "Wind", icon: "wind", ratio: 0.05, display: "5%", tone: "default" },
        { id: "balance", label: "Balance", icon: "balance", ratio: 0.98, display: "98%", tone: "ok" },
      ],
      note: "What reaches its brain right now",
    },
    vision: [eye("Left eye", 5), eye("Right eye", 2)],
    activity: true,
    events: [
      { time: "0:02", text: "Smelled sugar on the right, turned toward it" },
      { time: "0:05", text: "Walking with a tripod gait" },
      { time: "0:09", text: "Reached the sugar, started eating" },
      { time: "0:12", text: "You cast a shadow: froze, then ran left" },
    ],
  },
};

// In-memory sessions that behave: picking a tool selects it, changing the speed changes it.
export function createPlayFixture(): PlayPort {
  const sessions = new Map<string, PlaySession>(Object.entries(SESSIONS));
  const find = (project: string) => {
    const session = sessions.get(project) ?? sessions.get("park-pilot");
    if (!session) {
      throw new Error(`No Play session for ${project}`);
    }
    return session;
  };
  const save = (project: string, session: PlaySession) => {
    sessions.set(project, session);
    return session;
  };
  return {
    getSession: async (project) => find(project),
    // Emits the sample session once; the sample world does not move.
    connect: (project, listener) => {
      let connected = true;
      void Promise.resolve().then(() => {
        if (connected) {
          listener.onUpdate(find(project), { scene: null, poses: new Map(), rays: [], paused: false, speed: 1 });
        }
      });
      return () => {
        connected = false;
      };
    },
    send: async () => undefined,
    selectTool: async ({ project, tool: id }) => save(project, { ...find(project), selectedTool: id }),
    setSpeed: async ({ project, speed }) => save(project, { ...find(project), speed }),
  };
}
