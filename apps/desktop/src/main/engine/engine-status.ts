import type { EngineStatus } from "../../shared/engine-bridge.ts";

export type { EngineStatus };

export type EngineEvent =
  | { type: "healthy"; url: string; version: string }
  | { type: "exited"; code: number | null; lastLog: string[] }
  | { type: "timeout"; lastLog: string[] }
  | { type: "failed"; reason: string; lastLog: string[] }
  | { type: "restart" };

export function nextStatus(_status: EngineStatus, event: EngineEvent): EngineStatus {
  switch (event.type) {
    case "healthy":
      return { kind: "ready", url: event.url, version: event.version };
    case "exited":
      return {
        kind: "down",
        reason: event.code === null ? "The engine stopped" : `The engine exited with code ${event.code}`,
        lastLog: event.lastLog,
      };
    case "timeout":
      return { kind: "down", reason: "The engine did not start in time", lastLog: event.lastLog };
    case "failed":
      return { kind: "down", reason: event.reason, lastLog: event.lastLog };
    case "restart":
      return { kind: "starting" };
  }
}
