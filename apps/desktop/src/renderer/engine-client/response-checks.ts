import type {
  ApiError,
  LibraryCatalog,
  PlayEvent,
  PlayFrame,
  PlayMessage,
  PlayMessageEnvelope,
  PlayReading,
  PlaySessionInfo,
  ProjectState,
  ProjectSummary,
  Revision,
  SceneDescription,
  ValidationErrorBody,
} from "@icarus/contracts";

// Structural checks of engine answers: they verify the fields the app reads, not the whole schema.

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(value: unknown, key: string, kind: "string" | "number" | "boolean" | "object" | "array"): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const field = value[key];
  return kind === "array" ? Array.isArray(field) : kind === "object" ? isRecord(field) : typeof field === kind;
}

function isListOf<T>(value: unknown, item: (entry: unknown) => entry is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

export function isApiError(value: unknown): value is ApiError {
  return has(value, "code", "string") && has(value, "message", "string");
}

export function isValidationErrorBody(value: unknown): value is ValidationErrorBody {
  return (
    isApiError(value) &&
    has(value, "issues", "array") &&
    isRecord(value) &&
    isListOf(value.issues, (issue): issue is { path: string; message: string } => {
      return has(issue, "path", "string") && has(issue, "message", "string");
    })
  );
}

export function isProject(value: unknown): value is ProjectState["project"] {
  return (
    has(value, "id", "string") &&
    has(value, "name", "string") &&
    has(value, "world", "object") &&
    has(value, "bodies", "array") &&
    has(value, "brain", "object")
  );
}

export function isRevision(value: unknown): value is Revision {
  return has(value, "number", "number") && has(value, "summary", "string") && has(value, "created_at", "string");
}

export function isProjectState(value: unknown): value is ProjectState {
  return (
    isRecord(value) &&
    isProject(value.project) &&
    isRevision(value.revision) &&
    has(value.report, "ok", "boolean") &&
    has(value, "can_undo", "boolean") &&
    has(value, "can_redo", "boolean")
  );
}

export function isProjectSummaries(value: unknown): value is ProjectSummary[] {
  return isListOf(
    value,
    (item): item is ProjectSummary =>
      has(item, "id", "string") && has(item, "name", "string") && has(item, "revision", "number"),
  );
}

export function isRevisions(value: unknown): value is Revision[] {
  return isListOf(value, isRevision);
}

export function isLibraryCatalog(value: unknown): value is LibraryCatalog {
  return (
    has(value, "components", "array") &&
    has(value, "templates", "array") &&
    has(value, "reward_terms", "array") &&
    has(value, "pieces", "array")
  );
}

function isTriple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number");
}

function isGeom(value: unknown): boolean {
  return (
    isRecord(value) &&
    has(value, "name", "string") &&
    has(value, "body", "string") &&
    has(value, "shape", "string") &&
    has(value, "color", "string") &&
    isTriple(value.size, 3) &&
    isTriple(value.position, 3) &&
    isTriple(value.quaternion, 4)
  );
}

export function isSceneDescription(value: unknown): value is SceneDescription {
  return (
    isRecord(value) &&
    has(value, "bodies", "array") &&
    has(value, "lights", "array") &&
    Array.isArray(value.geoms) &&
    value.geoms.every(isGeom)
  );
}

function isReading(value: unknown): value is PlayReading {
  return (
    has(value, "id", "string") &&
    has(value, "label", "string") &&
    has(value, "value", "number") &&
    has(value, "min", "number") &&
    has(value, "max", "number")
  );
}

function isPose(value: unknown): boolean {
  return (
    isRecord(value) && has(value, "name", "string") && isTriple(value.position, 3) && isTriple(value.quaternion, 4)
  );
}

export function isPlaySessionInfo(value: unknown): value is PlaySessionInfo {
  return (
    isRecord(value) &&
    has(value, "project_id", "string") &&
    has(value, "brain", "string") &&
    isListOf(value.tools, (tool): tool is { id: string; label: string } => {
      return has(tool, "id", "string") && has(tool, "label", "string");
    }) &&
    isSceneDescription(value.scene)
  );
}

export function isPlayFrame(value: unknown): value is PlayFrame {
  return (
    isRecord(value) &&
    has(value, "time", "number") &&
    has(value, "speed", "number") &&
    has(value, "paused", "boolean") &&
    has(value, "reward", "number") &&
    has(value, "episode_return", "number") &&
    has(value.status, "title", "string") &&
    has(value.status, "detail", "string") &&
    Array.isArray(value.geoms) &&
    value.geoms.every(isPose) &&
    isListOf(value.senses, isReading) &&
    isListOf(value.actions, isReading)
  );
}

export function isPlayEvent(value: unknown): value is PlayEvent {
  return has(value, "time", "number") && has(value, "kind", "string") && has(value, "text", "string");
}

function isPlayMessage(value: unknown): value is PlayMessage {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "ready":
      return isPlaySessionInfo(value.session);
    case "frame":
      return isPlayFrame(value.frame);
    case "event":
      return isPlayEvent(value.event);
    case "error":
      return has(value, "message", "string");
    default:
      return false;
  }
}

export function isPlayMessageEnvelope(value: unknown): value is PlayMessageEnvelope {
  return isRecord(value) && isPlayMessage(value.message);
}

export function isNothing(value: unknown): value is undefined {
  return value === undefined || value === null;
}
