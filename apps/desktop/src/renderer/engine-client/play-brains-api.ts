import type { PlayBrainOption } from "@icarus/contracts";
import { request } from "./request.ts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// The trained brains Play can use for a project, each saying whether it fits the body now.

export function isPlayBrainOption(value: unknown): value is PlayBrainOption {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    has(value, "label", "string") &&
    has(value, "fits", "boolean") &&
    has(value, "default", "boolean") &&
    (value.reason === undefined || value.reason === null || typeof value.reason === "string")
  );
}

const isPlayBrainOptions = (value: unknown): value is PlayBrainOption[] => isListOf(value, isPlayBrainOption);

export const playBrainsApi = {
  playBrains: (projectId: string): Promise<PlayBrainOption[]> =>
    request(`/projects/${encodeURIComponent(projectId)}/play/brains`, {}, isPlayBrainOptions),
};

export type PlayBrainsApi = typeof playBrainsApi;
