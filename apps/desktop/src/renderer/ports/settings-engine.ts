import type {
  ModelSettings as EngineModelSettings,
  TrainingSettings as EngineTrainingSettings,
  ModelSettingsPatch,
  TrainingSettingsPatch,
} from "@icarus/contracts";
import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import type { ModelConnection, ModelSettings, SettingsPort, TrainingSettings } from "./settings-port.ts";

// Training and hardware settings on the engine: threads and the graphics card are saved there; folders are read only.

type SettingsApi = Pick<EngineApi, "trainingSettings" | "saveTrainingSettings">;

const checkpointsText = (settings: EngineTrainingSettings) => `Every scheduled checkpoint, in ${settings.runs_folder}`;

function view(settings: EngineTrainingSettings, version: string): TrainingSettings {
  return {
    threads: settings.threads,
    maxThreads: settings.max_threads,
    useGraphicsCard: settings.use_graphics_card,
    graphicsCard: settings.graphics_card,
    projectsFolder: settings.projects_folder,
    checkpoints: checkpointsText(settings),
    engine: { version, healthy: true },
  };
}

async function runningVersion(): Promise<string> {
  const status = await window.icarus.engine.status();
  return status.kind === "ready" ? status.version : "unknown";
}

export function createEngineTrainingSettings(
  api: SettingsApi = engineApi,
  version: () => Promise<string> = runningVersion,
): Pick<SettingsPort, "getTraining" | "setTraining"> {
  return {
    getTraining: async () => view(await api.trainingSettings(), await version()),
    setTraining: async (patch) => {
      const current = await api.trainingSettings();
      if (patch.projectsFolder !== undefined && patch.projectsFolder !== current.projects_folder) {
        throw new Error("The projects folder is set when the engine starts");
      }
      if (patch.checkpoints !== undefined && patch.checkpoints !== checkpointsText(current)) {
        throw new Error("The engine keeps every scheduled checkpoint");
      }
      const change: TrainingSettingsPatch = {};
      if (patch.threads !== undefined) {
        change.threads = patch.threads;
      }
      if (patch.useGraphicsCard !== undefined) {
        change.use_graphics_card = patch.useGraphicsCard;
      }
      const saved = Object.keys(change).length > 0 ? await api.saveTrainingSettings(change) : current;
      return view(saved, await version());
    },
  };
}

// AI model connections on the engine: one endpoint and key, one model name per capability; the key never comes back.

type ModelsApi = Pick<EngineApi, "modelSettings" | "saveModelSettings" | "testModelSettings">;

function modelsView(settings: EngineModelSettings): ModelSettings {
  return {
    endpoint: settings.endpoint,
    apiKeyHint: settings.api_key_hint,
    connections: settings.connections.map(
      (connection): ModelConnection => ({
        capability: connection.capability,
        model: connection.model,
        required: connection.required,
        connected: connection.connected,
        ...(connection.detail ? { detail: connection.detail } : {}),
      }),
    ),
  };
}

export function createEngineModelSettings(
  api: ModelsApi = engineApi,
): Pick<SettingsPort, "getModelSettings" | "saveModelSettings" | "testModelConnection"> {
  return {
    getModelSettings: async () => modelsView(await api.modelSettings()),
    saveModelSettings: async ({ endpoint, apiKey, models }) => {
      const patch: ModelSettingsPatch = { endpoint: endpoint.trim() };
      if (apiKey.trim() !== "") {
        patch.api_key = apiKey.trim();
      }
      const named = Object.entries(models).flatMap(([capability, name]) =>
        name && name.trim() !== "" ? [[capability, name.trim()] as const] : [],
      );
      if (named.length > 0) {
        patch.models = Object.fromEntries(named);
      }
      return modelsView(await api.saveModelSettings(patch));
    },
    testModelConnection: async () => modelsView(await api.testModelSettings()),
  };
}
