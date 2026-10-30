export type EngineStatus =
  | { kind: "starting" }
  | { kind: "ready"; url: string; version: string }
  | { kind: "down"; reason: string; lastLog: string[] };

export type EngineBridge = {
  status(): Promise<EngineStatus>;
  onStatus(callback: (status: EngineStatus) => void): () => void;
  restart(): Promise<void>;
};

export const ENGINE_CHANNEL = {
  status: "engine:status",
  changed: "engine:changed",
  restart: "engine:restart",
} as const;
