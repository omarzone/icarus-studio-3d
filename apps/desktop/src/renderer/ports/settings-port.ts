import type { FolderChoice } from "../../shared/storage-bridge.ts";
import { definePort } from "../app/runtime/port.tsx";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createCommunityPrivacy } from "./privacy-community.ts";
import { createSettingsFixture } from "./settings.fixture.ts";
import { createEngineModelSettings, createEngineTrainingSettings } from "./settings-engine.ts";
import { createEngineStorage } from "./storage-engine.ts";

export type ModelCapability = "reasoning" | "vision" | "image" | "pose";

export type ModelConnection = {
  capability: ModelCapability;
  // Model name and connection kind as configured, or null when the capability is not set.
  model: string | null;
  required: boolean;
  connected: boolean;
  // Why it is not connected, in words.
  detail?: string;
  // The model's context window in tokens as the person set it; absent means the copilot assumes one.
  contextTokens?: number;
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

export type DataFolderMove = {
  state: "idle" | "moving" | "done" | "failed";
  folder: string | null;
  progress: number;
  text: string;
  // What moved and what stayed where it was, one sentence each.
  lines: string[];
  // The new folder is saved; the engine uses it once it starts again.
  restartNeeded: boolean;
};

export type StorageSettings = {
  dataFolder: string;
  projectsFolder: string;
  runsFolder: string;
  projectsBytes: number;
  runsBytes: number;
  freeBytes: number;
  setByEnvironment: boolean;
  move: DataFolderMove;
};

export type DataFolderCheck = { folder: string; problem: string | null; neededBytes: number; freeBytes: number };

export type NotificationOption = "runFinished" | "copilotNeedsOk" | "remixOrComment" | "communityNews";

export type NotificationSettings = Record<NotificationOption, boolean>;

export type SettingsPort = {
  getModelSettings: () => Promise<ModelSettings>;
  // An empty key keeps the stored one; only the model names and context windows given change; an empty name clears
  // it and a null window goes back to the assumed one.
  saveModelSettings: (input: {
    endpoint: string;
    apiKey: string;
    models: Partial<Record<ModelCapability, string>>;
    contextTokens?: Partial<Record<ModelCapability, number | null>>;
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
  getStorage: () => Promise<StorageSettings>;
  // Opens the native folder picker.
  chooseDataFolder: () => Promise<FolderChoice>;
  checkDataFolder: (folder: string) => Promise<DataFolderCheck>;
  // Moving leaves nothing behind but what could not be verified; otherwise the old data stays where it is.
  changeDataFolder: (input: { folder: string; moveData: boolean }) => Promise<DataFolderMove>;
  getDataFolderMove: () => Promise<DataFolderMove>;
  getNotificationSettings: () => Promise<NotificationSettings>;
  setNotification: (input: { option: NotificationOption; value: boolean }) => Promise<NotificationSettings>;
};

export const settingsPort = definePort<SettingsPort>({
  app: {
    ...createEngineModelSettings(),
    ...createCommunityPrivacy(),
    ...createEngineTrainingSettings(),
    // The main process restarts it; requests wait while it starts again.
    restartEngine: () => window.icarus.engine.restart(),
    ...createEngineStorage(),
  },
  prototype: createSettingsFixture,
});
