import { describe, expect, it } from "vitest";
import type { ModelSettings } from "../../ports/settings-port.ts";
import { modelSettingsRequest, parseContextTokens } from "./model-settings-form.ts";

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
      invalidWindows: [],
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

  it("sends a set context window, clears an emptied one, and leaves unchanged ones out", () => {
    const withWindow: ModelSettings = {
      ...saved,
      connections: saved.connections.map((connection) =>
        connection.capability === "vision" ? { ...connection, contextTokens: 128_000 } : connection,
      ),
    };
    const request = modelSettingsRequest(withWindow, {
      endpoint: saved.endpoint,
      apiKey: "",
      names,
      windows: { reasoning: "1,000,000", vision: "", image: "" },
    });
    expect(request.input.contextTokens).toEqual({ reasoning: 1_000_000, vision: null });
    expect(request.invalidWindows).toEqual([]);
    const same = modelSettingsRequest(withWindow, {
      endpoint: saved.endpoint,
      apiKey: "",
      names,
      windows: { vision: "128000" },
    });
    expect(same.input.contextTokens).toBeUndefined();
  });

  it("refuses a window that is not a whole number from 4,000 to 10,000,000 tokens", () => {
    for (const typed of ["3999", "10000001", "1.5k", "lots", "-64000"]) {
      expect(parseContextTokens(typed)).toBeUndefined();
      const request = modelSettingsRequest(saved, {
        endpoint: saved.endpoint,
        apiKey: "",
        names,
        windows: { reasoning: typed },
      });
      expect(request.invalidWindows).toEqual(["reasoning"]);
      expect(request.input.contextTokens).toBeUndefined();
    }
    expect(parseContextTokens(" 64 000 ")).toBe(64_000);
    expect(parseContextTokens("")).toBeNull();
  });
});
