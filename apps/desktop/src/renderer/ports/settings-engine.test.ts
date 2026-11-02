import type { TrainingSettings, TrainingSettingsPatch } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineTrainingSettings } from "./settings-engine.ts";

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
