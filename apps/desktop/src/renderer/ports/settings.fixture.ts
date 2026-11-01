import type {
  ModelSettings,
  NotificationSettings,
  PrivacySettings,
  SettingsPort,
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

const NOTIFICATIONS: NotificationSettings = {
  runFinished: true,
  copilotNeedsOk: true,
  remixOrComment: true,
  communityNews: false,
};

export function createSettingsFixture(): SettingsPort {
  let models = MODELS;
  let privacy = PRIVACY;
  let training = TRAINING;
  let notifications = NOTIFICATIONS;
  return {
    getModelSettings: async () => models,
    saveModelSettings: async ({ endpoint, apiKey }) => {
      models = { ...models, endpoint, apiKeyHint: apiKey === "" ? models.apiKeyHint : apiKey.slice(-4) };
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
    getNotificationSettings: async () => notifications,
    setNotification: async ({ option, value }) => {
      notifications = { ...notifications, [option]: value };
      return notifications;
    },
  };
}
