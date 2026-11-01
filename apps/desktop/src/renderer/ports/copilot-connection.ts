import { EngineError } from "../engine-client/request.ts";

// No model is connected, so the copilot cannot answer; views offer Settings › AI models instead of an error.
export class CopilotNotConnected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotNotConnected";
  }
}

// Runs a copilot call and turns the engine's "not_connected" answer into CopilotNotConnected.
export async function withCopilot<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof EngineError && error.code === "not_connected") {
      throw new CopilotNotConnected(error.message);
    }
    throw error;
  }
}
