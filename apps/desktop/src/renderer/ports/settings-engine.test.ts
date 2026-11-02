import type {
  ModelConnection,
  ModelSettings,
  ModelSettingsPatch,
  TrainingSettings,
  TrainingSettingsPatch,
} from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineModelSettings, createEngineTrainingSettings } from "./settings-engine.ts";

const stored: TrainingSettings = {
  threads: 6,
  max_threads: 8,
  use_graphics_card: false,
  graphics_card: null,
  projects_folder: "C:/Icarus/projects",
  runs_folder: "C:/Icarus/runs",
};

function engine() {
  let current = stored;
  const saved: TrainingSettingsPatch[] = [];
  const api = {
    trainingSettings: vi.fn(async () => current),
    saveTrainingSettings: vi.fn(async (patch: TrainingSettingsPatch) => {
      saved.push(patch);
      current = { ...current, threads: patch.threads ?? current.threads };
      return current;
    }),
  };
  const version = async () => "0.5.0";
  return { settings: createEngineTrainingSettings(api, version), saved, api };
}

describe("training settings on the engine", () => {
  it("shows the engine's settings, where checkpoints go and the running engine", async () => {
    expect(await engine().settings.getTraining()).toEqual({
      threads: 6,
      maxThreads: 8,
      useGraphicsCard: false,
      graphicsCard: null,
      projectsFolder: "C:/Icarus/projects",
      checkpoints: "Every scheduled checkpoint, in C:/Icarus/runs",
      engine: { version: "0.5.0", healthy: true },
    });
  });

  it("saves threads and the graphics card choice", async () => {
    const { settings, saved } = engine();
    expect((await settings.setTraining({ threads: 3 })).threads).toBe(3);
    await settings.setTraining({ useGraphicsCard: true });
    expect(saved).toEqual([{ threads: 3 }, { use_graphics_card: true }]);
  });

  it("leaves unchanged folders alone and says plainly that they cannot be moved here", async () => {
    const { settings, saved } = engine();
    expect((await settings.setTraining({ projectsFolder: "C:/Icarus/projects" })).threads).toBe(6);
    await expect(settings.setTraining({ projectsFolder: "D:/elsewhere" })).rejects.toThrow(
      "The projects folder is set when the engine starts",
    );
    await expect(settings.setTraining({ checkpoints: "Best only" })).rejects.toThrow(
      "The engine keeps every scheduled checkpoint",
    );
    expect(saved).toEqual([]);
  });
});

describe("model settings on the engine", () => {
  const reasoning: ModelConnection = {
    capability: "reasoning",
    model: "thinker",
    required: true,
    connected: false,
    detail: "The endpoint did not answer",
  };
  const models: ModelSettings = {
    endpoint: "https://models.example/v1",
    api_key_hint: "7f3a",
    connections: [reasoning, { capability: "vision", model: null, required: false, connected: false }],
  };

  function modelsEngine() {
    const saved: ModelSettingsPatch[] = [];
    const api = {
      modelSettings: vi.fn(async () => models),
      saveModelSettings: vi.fn(async (patch: ModelSettingsPatch) => {
        saved.push(patch);
        return models;
      }),
      testModelSettings: vi.fn(
        async (): Promise<ModelSettings> => ({
          ...models,
          connections: [{ ...reasoning, connected: true }],
        }),
      ),
    };
    return { settings: createEngineModelSettings(api), saved, api };
  }

  it("shows each capability's model, its status and why it is not connected", async () => {
    const view = await modelsEngine().settings.getModelSettings();
    expect(view.endpoint).toBe("https://models.example/v1");
    expect(view.apiKeyHint).toBe("7f3a");
    expect(view.connections).toEqual([
      {
        capability: "reasoning",
        model: "thinker",
        required: true,
        connected: false,
        detail: "The endpoint did not answer",
      },
      { capability: "vision", model: null, required: false, connected: false },
    ]);
  });

  it("saves the endpoint and model names, and the key only when one was typed", async () => {
    const { settings, saved } = modelsEngine();
    await settings.saveModelSettings({
      endpoint: " https://x/v1 ",
      apiKey: "",
      models: { reasoning: " thinker-2 " },
    });
    await settings.saveModelSettings({ endpoint: "https://x/v1", apiKey: "sk-new", models: {} });
    expect(saved).toEqual([
      { endpoint: "https://x/v1", models: { reasoning: "thinker-2" } },
      { endpoint: "https://x/v1", api_key: "sk-new" },
    ]);
  });

  it("clears a model name that was emptied", async () => {
    const { settings, saved } = modelsEngine();
    await settings.saveModelSettings({ endpoint: "https://x/v1", apiKey: "", models: { vision: " " } });
    expect(saved).toEqual([{ endpoint: "https://x/v1", models: { vision: "" } }]);
  });

  it("tests the connection on the engine", async () => {
    const { settings, api } = modelsEngine();
    expect((await settings.testModelConnection()).connections[0]?.connected).toBe(true);
    expect(api.testModelSettings).toHaveBeenCalled();
  });
});
