import { describe, expect, it } from "vitest";
import type { ModelSettings } from "../../ports/settings-port.ts";
import { modelSettingsRequest } from "./model-settings-form.ts";

const saved: ModelSettings = {
  endpoint: "https://models.example/v1",
  apiKeyHint: "7f3a",
  connections: [
    { capability: "reasoning", model: "thinker", required: true, connected: true },
    { capability: "vision", model: "watcher", required: false, connected: true },
    { capability: "image", model: null, required: false, connected: false },
  ],
};

const names = { reasoning: "thinker", vision: "watcher", image: "" };

describe("what the AI models form sends", () => {
  it("keeps the stored key when the address is unchanged and no key was typed", () => {
    const request = modelSettingsRequest(saved, { endpoint: " https://models.example/v1 ", apiKey: "", names });
    expect(request).toEqual({
      input: { endpoint: " https://models.example/v1 ", apiKey: "", models: {} },
      keyRequired: false,
    });
  });

  it("asks for a key when the address changed and none was typed, because the engine clears the old one", () => {
    expect(modelSettingsRequest(saved, { endpoint: "https://other.example/v1", apiKey: " ", names }).keyRequired).toBe(
      true,
    );
    expect(
      modelSettingsRequest(saved, { endpoint: "https://other.example/v1", apiKey: "sk-new", names }).keyRequired,
    ).toBe(false);
  });

  it("sends only the model names that changed, with an emptied name as an empty string to clear it", () => {
    const request = modelSettingsRequest(saved, {
      endpoint: saved.endpoint,
      apiKey: "",
      names: { reasoning: "thinker-2", vision: "", image: "" },
    });
    expect(request.input.models).toEqual({ reasoning: "thinker-2", vision: "" });
  });
});
