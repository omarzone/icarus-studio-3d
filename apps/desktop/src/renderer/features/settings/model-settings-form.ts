import type { ModelCapability, ModelSettings, SettingsPort } from "../../ports/settings-port.ts";

export type ModelSettingsForm = {
  endpoint: string;
  apiKey: string;
  names: Partial<Record<ModelCapability, string>>;
};

export type ModelSettingsRequest = {
  input: Parameters<SettingsPort["saveModelSettings"]>[0];
  // The engine clears the stored key when the address changes, so testing needs a key typed for the new one.
  keyRequired: boolean;
};

// What Save and Test send: only the model names the user changed, and whether a key must be typed first.
export function modelSettingsRequest(saved: ModelSettings, form: ModelSettingsForm): ModelSettingsRequest {
  const models: Partial<Record<ModelCapability, string>> = {};
  for (const connection of saved.connections) {
    const name = form.names[connection.capability];
    if (name !== undefined && name.trim() !== (connection.model ?? "")) {
      models[connection.capability] = name;
    }
  }
  const endpointChanged = form.endpoint.trim() !== saved.endpoint.trim();
  return {
    input: { endpoint: form.endpoint, apiKey: form.apiKey, models },
    keyRequired: endpointChanged && form.apiKey.trim() === "",
  };
}
