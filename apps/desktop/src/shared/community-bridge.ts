// The community service seen from the renderer: the main process keeps the server address, the sign-in session and
// its tokens, and forwards requests; the renderer only learns whether someone is signed in and the answers.

export type CommunityAuthMode = "supabase" | "dev";

export type CommunityConnection = {
  communityUrl: string;
  supabaseUrl: string;
  hasAnonKey: boolean;
  // Without a Supabase project the app signs in through the server's development mode.
  authMode: CommunityAuthMode;
  // The address Supabase must allow as a redirect for sign-in links and OAuth.
  callbackUrl: string;
};

export type CommunitySession = { signedIn: false } | { signedIn: true; email: string };

export type SignInProviderId = "google" | "github" | "email";

export type CommunitySignIn = { provider: SignInProviderId; email?: string };

export type SignInResult =
  | { kind: "signed-in"; email: string }
  | { kind: "link-sent"; email: string }
  | { kind: "failed"; reason: string };

export type CommunityMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type CommunityRequest = { method: CommunityMethod; path: string; body?: unknown; picture?: boolean };

export type CommunityResponse =
  | { kind: "json"; status: number; body: unknown }
  // Pictures come back as data URLs, so the renderer never loads from the server directly.
  | { kind: "picture"; status: number; dataUrl: string | null }
  | { kind: "unreachable"; reason: string };

export type CommunityBridge = {
  connection(): Promise<CommunityConnection>;
  session(): Promise<CommunitySession>;
  signIn(request: CommunitySignIn): Promise<SignInResult>;
  signOut(): Promise<void>;
  request(request: CommunityRequest): Promise<CommunityResponse>;
  onSession(callback: (session: CommunitySession) => void): () => void;
};

export const COMMUNITY_CHANNEL = {
  connection: "community:connection",
  session: "community:session",
  signIn: "community:sign-in",
  signOut: "community:sign-out",
  request: "community:request",
  changed: "community:session-changed",
} as const;

const METHODS: readonly string[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
// Only the versioned API, with no way to climb out of it or reach another host.
const API_PATH = /^\/v1\/[A-Za-z0-9/_\-.~%?=&]*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCommunityRequest(value: unknown): value is CommunityRequest {
  if (!isRecord(value) || typeof value.method !== "string" || typeof value.path !== "string") {
    return false;
  }
  if (value.picture !== undefined && typeof value.picture !== "boolean") {
    return false;
  }
  return METHODS.includes(value.method) && API_PATH.test(value.path) && !value.path.includes("..");
}

export function isCommunitySignIn(value: unknown): value is CommunitySignIn {
  if (!isRecord(value) || !["google", "github", "email"].includes(String(value.provider))) {
    return false;
  }
  return value.email === undefined || (typeof value.email === "string" && value.email.length <= 320);
}

export function isCommunitySession(value: unknown): value is CommunitySession {
  if (!isRecord(value)) {
    return false;
  }
  return value.signedIn === false || (value.signedIn === true && typeof value.email === "string");
}

export function isCommunityConnection(value: unknown): value is CommunityConnection {
  return (
    isRecord(value) &&
    typeof value.communityUrl === "string" &&
    typeof value.supabaseUrl === "string" &&
    typeof value.hasAnonKey === "boolean" &&
    (value.authMode === "supabase" || value.authMode === "dev") &&
    typeof value.callbackUrl === "string"
  );
}

export function isSignInResult(value: unknown): value is SignInResult {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "failed") {
    return typeof value.reason === "string";
  }
  return (value.kind === "signed-in" || value.kind === "link-sent") && typeof value.email === "string";
}

export function isCommunityResponse(value: unknown): value is CommunityResponse {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "json":
      return typeof value.status === "number";
    case "picture":
      return typeof value.status === "number" && (value.dataUrl === null || typeof value.dataUrl === "string");
    case "unreachable":
      return typeof value.reason === "string";
    default:
      return false;
  }
}
