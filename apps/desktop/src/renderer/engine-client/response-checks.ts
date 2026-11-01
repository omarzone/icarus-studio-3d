import type {
  ApiError,
  LibraryCatalog,
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

export function isSceneDescription(value: unknown): value is SceneDescription {
  return has(value, "bodies", "array") && has(value, "geoms", "array") && has(value, "lights", "array");
}

export function isNothing(value: unknown): value is undefined {
  return value === undefined || value === null;
}
