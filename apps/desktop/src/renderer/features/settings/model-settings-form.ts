import type { ModelCapability, ModelSettings, SettingsPort } from "../../ports/settings-port.ts";

// The context windows the engine accepts, from small local models to million-token ones.
export const CONTEXT_TOKENS_RANGE = { min: 4_000, max: 10_000_000 } as const;

export type ModelSettingsForm = {
  endpoint: string;
  apiKey: string;
  names: Partial<Record<ModelCapability, string>>;
  // Typed context windows; empty means the engine assumes one.
  windows?: Partial<Record<ModelCapability, string>>;
};

export type ModelSettingsRequest = {
  input: Parameters<SettingsPort["saveModelSettings"]>[0];
  // The engine clears the stored key when the address changes, so testing needs a key typed for the new one.
  keyRequired: boolean;
  // Capabilities whose typed window is not a whole number in range; nothing is saved while there are any.
  invalidWindows: ModelCapability[];
};

// A typed window: null when empty (assumed), the number when it is a whole number in range, otherwise undefined.
export function parseContextTokens(text: string): number | null | undefined {
  const plain = text.replace(/[\s,_]/g, "");
  if (plain === "") {
    return null;
  }
  if (!/^\d+$/.test(plain)) {
    return undefined;
  }
  const tokens = Number(plain);
  return tokens >= CONTEXT_TOKENS_RANGE.min && tokens <= CONTEXT_TOKENS_RANGE.max ? tokens : undefined;
}

// What Save and Test send: only the model names and windows the user changed, and whether a key must be typed first.
export function modelSettingsRequest(saved: ModelSettings, form: ModelSettingsForm): ModelSettingsRequest {
  const models: Partial<Record<ModelCapability, string>> = {};
  const contextTokens: Partial<Record<ModelCapability, number | null>> = {};
  const invalidWindows: ModelCapability[] = [];
  for (const connection of saved.connections) {
    const name = form.names[connection.capability];
    if (name !== undefined && name.trim() !== (connection.model ?? "")) {
      models[connection.capability] = name;
    }
    const typed = form.windows?.[connection.capability];
    if (typed === undefined) {
      continue;
    }
    const tokens = parseContextTokens(typed);
    if (tokens === undefined) {
      invalidWindows.push(connection.capability);
    } else if (tokens !== (connection.contextTokens ?? null)) {
      contextTokens[connection.capability] = tokens;
    }
  }
  const endpointChanged = form.endpoint.trim() !== saved.endpoint.trim();
  const input: ModelSettingsRequest["input"] = { endpoint: form.endpoint, apiKey: form.apiKey, models };
  if (Object.keys(contextTokens).length > 0) {
    input.contextTokens = contextTokens;
  }
  return { input, keyRequired: endpointChanged && form.apiKey.trim() === "", invalidWindows };
}
