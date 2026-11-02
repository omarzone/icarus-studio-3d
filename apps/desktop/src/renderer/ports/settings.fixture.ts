import type {
  ModelSettings,
  NotificationSettings,
  PrivacySettings,
  SettingsPort,
  StorageSettings,
  TrainingSettings,
} from "./settings-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const MODELS: ModelSettings = {
  connections: [
    { capability: "reasoning", model: "default model · OpenAI-compatible", required: true, connected: true },
    { capability: "vision", model: "default model", required: true, connected: true },
    { capability: "image", model: null, required: false, connected: false },
    { capability: "pose", model: "default model", required: true, connected: true },
  ],
  endpoint: "https://api.example.com/v1",
  apiKeyHint: "7f3a",
};

const PRIVACY: PrivacySettings = {
  showCreations: true,
  allowRemix: true,
  allowComments: true,
  blocked: [
    { handle: "spam_bot42", initials: "SP", tone: 5 },
    { handle: "xx_copycat", initials: "XX", tone: 6 },
  ],
};

const TRAINING: TrainingSettings = {
  threads: 10,
  maxThreads: 12,
  useGraphicsCard: false,
  graphicsCard: null,
  projectsFolder: "Documents / Icarus",
  checkpoints: "Best + every 100k",
  engine: { version: "0.4", healthy: true },
};

const GB = 1024 ** 3;

const STORAGE: StorageSettings = {
  dataFolder: "Documents / Icarus",
  projectsFolder: "Documents / Icarus / projects",
  runsFolder: "Documents / Icarus / runs",
  projectsBytes: 0.4 * GB,
  runsBytes: 6.2 * GB,
  freeBytes: 18 * GB,
  setByEnvironment: false,
  move: { state: "idle", folder: null, progress: 0, text: "", lines: [], restartNeeded: false },
};

// The folder the prototype's picker answers with.
const PICKED = "Data / Icarus";

const NOTIFICATIONS: NotificationSettings = {
  runFinished: true,
  copilotNeedsOk: true,
  remixOrComment: true,
  communityNews: false,
};

// A model name left out stays; an emptied one clears the capability.
function renamed(model: string | null, name: string | undefined): string | null {
  return name === undefined ? model : name.trim() || null;
}

export function createSettingsFixture(): SettingsPort {
  let models = MODELS;
  let privacy = PRIVACY;
  let training = TRAINING;
  let notifications = NOTIFICATIONS;
  let storage = STORAGE;
  return {
    getModelSettings: async () => models,
    saveModelSettings: async ({ endpoint, apiKey, models: names }) => {
      const connections = models.connections.map((connection) => ({
        ...connection,
        model: renamed(connection.model, names[connection.capability]),
      }));
      models = { connections, endpoint, apiKeyHint: apiKey === "" ? models.apiKeyHint : apiKey.slice(-4) };
      return models;
    },
    testModelConnection: async () => models,
    getPrivacy: async () => privacy,
    setPrivacy: async ({ option, value }) => {
      privacy = { ...privacy, [option]: value };
      return privacy;
    },
    unblock: async (handle) => {
      privacy = { ...privacy, blocked: privacy.blocked.filter((person) => person.handle !== handle) };
      return privacy;
    },
    downloadMyData: async () => undefined,
    deleteAccount: async () => undefined,
    getTraining: async () => training,
    setTraining: async (patch) => {
      training = { ...training, ...patch };
      return training;
    },
    restartEngine: async () => undefined,
    getStorage: async () => storage,
    chooseDataFolder: async () => ({ kind: "chosen", folder: PICKED }),
    checkDataFolder: async (folder) => ({
      folder,
      problem: folder === storage.dataFolder ? "This is already the data folder" : null,
      neededBytes: storage.projectsBytes + storage.runsBytes,
      freeBytes: 240 * GB,
    }),
    changeDataFolder: async ({ folder, moveData }) => {
      const lines = moveData ? [`Moved 3 projects from ${storage.projectsFolder} to ${folder} / projects`] : [];
      const move = {
        state: "done" as const,
        folder,
        progress: 1,
        text: "Done",
        lines: [...lines, `Icarus now keeps projects and runs in ${folder}`],
        restartNeeded: true,
      };
      storage = {
        ...storage,
        dataFolder: folder,
        projectsFolder: `${folder} / projects`,
        runsFolder: `${folder} / runs`,
        ...(moveData ? {} : { projectsBytes: 0, runsBytes: 0 }),
        move,
      };
      return move;
    },
    getDataFolderMove: async () => storage.move,
    getNotificationSettings: async () => notifications,
    setNotification: async ({ option, value }) => {
      notifications = { ...notifications, [option]: value };
      return notifications;
    },
  };
}
