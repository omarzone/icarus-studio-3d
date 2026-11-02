import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createSettingsFixture } from "./settings.fixture.ts";
import { createEngineModelSettings, createEngineTrainingSettings } from "./settings-engine.ts";

export type ModelCapability = "reasoning" | "vision" | "image" | "pose";

export type ModelConnection = {
  capability: ModelCapability;
  // Model name and connection kind as configured, or null when the capability is not set.
  model: string | null;
  required: boolean;
  connected: boolean;
  // Why it is not connected, in words.
  detail?: string;
};

export type ModelSettings = {
  connections: ModelConnection[];
  endpoint: string;
  // Last characters of the stored key; the key itself never leaves the engine.
  apiKeyHint: string;
};

export type PrivacyOption = "showCreations" | "allowRemix" | "allowComments";

export type BlockedPerson = { handle: string; initials: string; tone: AvatarTone };

export type PrivacySettings = Record<PrivacyOption, boolean> & { blocked: BlockedPerson[] };

export type TrainingSettings = {
  threads: number;
  maxThreads: number;
  useGraphicsCard: boolean;
  graphicsCard: string | null;
  projectsFolder: string;
  checkpoints: string;
  engine: { version: string; healthy: boolean };
};

export type NotificationOption = "runFinished" | "copilotNeedsOk" | "remixOrComment" | "communityNews";

export type NotificationSettings = Record<NotificationOption, boolean>;

export type SettingsPort = {
  getModelSettings: () => Promise<ModelSettings>;
  // An empty key keeps the stored one; only the model names given change, and an empty name clears it.
  saveModelSettings: (input: {
    endpoint: string;
    apiKey: string;
    models: Partial<Record<ModelCapability, string>>;
  }) => Promise<ModelSettings>;
  testModelConnection: () => Promise<ModelSettings>;
  getPrivacy: () => Promise<PrivacySettings>;
  setPrivacy: (input: { option: PrivacyOption; value: boolean }) => Promise<PrivacySettings>;
  unblock: (handle: string) => Promise<PrivacySettings>;
  downloadMyData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  getTraining: () => Promise<TrainingSettings>;
  setTraining: (patch: Partial<Omit<TrainingSettings, "engine" | "maxThreads">>) => Promise<TrainingSettings>;
  restartEngine: () => Promise<void>;
  getNotificationSettings: () => Promise<NotificationSettings>;
  setNotification: (input: { option: NotificationOption; value: boolean }) => Promise<NotificationSettings>;
};

export const settingsPort = definePort<SettingsPort>({
  app: {
    ...createEngineModelSettings(),
    getPrivacy: pending({
      key: "settings.privacy",
      summary: "Privacy settings",
      sprint: 13,
      ids: ["SCR-SETTINGS-PRIVACY"],
    }),
    setPrivacy: pending({
      key: "settings.privacy-set",
      summary: "Changing privacy settings",
      sprint: 13,
      ids: ["SCR-SETTINGS-PRIVACY"],
    }),
    unblock: pending({
      key: "settings.unblock",
      summary: "Unblocking people",
      sprint: 13,
      ids: ["SCR-SETTINGS-PRIVACY"],
    }),
    downloadMyData: pending({
      key: "settings.download-data",
      summary: "Downloading your data",
      sprint: 13,
      ids: ["SCR-SETTINGS-PRIVACY"],
    }),
    deleteAccount: pending({
      key: "settings.delete-account",
      summary: "Deleting your account",
      sprint: 13,
      ids: ["SCR-SETTINGS-PRIVACY"],
    }),
    ...createEngineTrainingSettings(),
    restartEngine: pending({
      key: "settings.restart-engine",
      summary: "Restarting the engine from settings",
      sprint: 5,
      ids: ["SCR-SETTINGS-TRAINING"],
    }),
    getNotificationSettings: pending({
      key: "settings.notifications",
      summary: "Notification settings",
      sprint: 13,
      ids: ["SCR-SETTINGS-NOTIFICATIONS"],
    }),
    setNotification: pending({
      key: "settings.notifications-set",
      summary: "Changing notification settings",
      sprint: 13,
      ids: ["SCR-SETTINGS-NOTIFICATIONS"],
    }),
  },
  prototype: createSettingsFixture,
});
