import type { BuildStatus, DesignIdea, IdeaSet as EngineIdeaSet } from "@icarus/contracts";
import type { BuildProgress } from "./build-progress-port.ts";
import type { Idea, IdeaSet } from "./ideas-port.ts";

// Pure mappings from the copilot's ideas and builds onto the views that show them.

// Training time on this computer in words; the engine estimates it from the template's steps (ADR 001).
export function estimateText(minutes: number): string {
  if (minutes < 1) {
    return "under a minute";
  }
  const rounded = Math.round(minutes);
  if (rounded < 60) {
    return `about ${rounded} min`;
  }
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `about ${hours} h` : `about ${hours} h ${rest} min`;
}

export function ideaSource(template: string): string {
  if (template === "empty_world") {
    return "Designed from scratch";
  }
  const name = template.replaceAll("_", " ");
  return `Built on the ${name.charAt(0).toUpperCase()}${name.slice(1)} template`;
}

function ideaView(idea: DesignIdea): Idea {
  return {
    id: idea.id,
    title: idea.title,
    world: idea.world,
    body: idea.body,
    learns: idea.learns,
    estimate: estimateText(idea.estimate_minutes),
    recommended: idea.recommended,
    scene: idea.scene,
    source: ideaSource(idea.template),
  };
}

export function ideaSetView(set: EngineIdeaSet): IdeaSet {
  // Mixing parts of two ideas is not built yet, so the engine's sets never propose a mix.
  return { id: set.id, ideas: set.ideas.map(ideaView), mix: null, prompt: set.prompt };
}

export function buildProgressView(status: BuildStatus): BuildProgress {
  return {
    project: "the project",
    progress: status.progress,
    steps: status.steps,
    activity: status.activity,
    ready: status.ready,
    projectId: status.project_id,
    error: status.error ?? null,
  };
}
