import type {
  CommunityConnection,
  CommunityRequest,
  CommunityResponse,
  CommunitySession,
  CommunitySignIn,
  SignInResult,
} from "../../shared/community-bridge.ts";
import type { CommunityConfig } from "./community-config.ts";
import { DevSession } from "./dev-session.ts";
import type { CallbackWait } from "./loopback-callback.ts";
import { CALLBACK_PATH, DEFAULT_CALLBACK_PORT } from "./loopback-callback.ts";
import type { SessionVault } from "./session-vault.ts";
import { SupabaseSession } from "./supabase-session.ts";

const REQUEST_TIMEOUT_MS = 30_000;
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type CommunityServiceDeps = {
  readConfig: () => CommunityConfig;
  vault: SessionVault;
  openExternal: (url: string) => Promise<void>;
  waitForCallback: (timeoutMs: number) => Promise<CallbackWait>;
  fetchFn?: typeof fetch;
};

// Everything the app does with the community service from the main process: which server and Supabase project,
// who is signed in, and forwarding the renderer's requests with the access token attached.
export class CommunityService {
  private config: CommunityConfig;
  private supabase: SupabaseSession | null = null;
  private readonly dev: DevSession;
  private readonly fetchFn: typeof fetch;
  private listeners = new Set<(session: CommunitySession) => void>();

  constructor(private readonly deps: CommunityServiceDeps) {
    this.config = deps.readConfig();
    this.fetchFn = deps.fetchFn ?? fetch;
    this.dev = new DevSession(deps.vault, this.fetchFn);
  }

  connection(): CommunityConnection {
    const supabase = this.config.supabaseUrl !== "" && this.config.supabaseAnonKey !== "";
    return {
      communityUrl: this.config.communityUrl,
      supabaseUrl: this.config.supabaseUrl,
      hasAnonKey: this.config.supabaseAnonKey !== "",
      authMode: supabase ? "supabase" : "dev",
      callbackUrl: `http://127.0.0.1:${DEFAULT_CALLBACK_PORT}${CALLBACK_PATH}`,
    };
  }

  onSession(listener: (session: CommunitySession) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async announce(): Promise<void> {
    const session = await this.session();
    for (const listener of this.listeners) {
      listener(session);
    }
  }

  private supabaseSession(): SupabaseSession | null {
    if (this.connection().authMode !== "supabase") {
      return null;
    }
    if (this.supabase === null) {
      this.supabase = new SupabaseSession(
        { url: this.config.supabaseUrl, anonKey: this.config.supabaseAnonKey },
        { vault: this.deps.vault, openExternal: this.deps.openExternal, waitForCallback: this.deps.waitForCallback },
      );
      this.supabase.onChange = () => void this.announce();
    }
    return this.supabase;
  }

  private async token(): Promise<{ token: string; email: string } | null> {
    try {
      const supabase = this.supabaseSession();
      return supabase ? await supabase.accessToken() : await this.dev.accessToken(this.config.communityUrl);
    } catch {
      return null;
    }
  }

  async session(): Promise<CommunitySession> {
    const current = await this.token();
    return current ? { signedIn: true, email: current.email } : { signedIn: false };
  }

  async signIn(request: CommunitySignIn): Promise<SignInResult> {
    const supabase = this.supabaseSession();
    let result: SignInResult;
    try {
      result = supabase
        ? await supabase.signIn(request.provider, request.email)
        : { kind: "signed-in", email: await this.dev.signIn(this.config.communityUrl) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Sign-in failed";
      result = {
        kind: "failed",
        reason: reason.includes("fetch failed") ? "The community server did not answer" : reason,
      };
    }
    await this.announce();
    return result;
  }

  async signOut(): Promise<void> {
    this.dev.signOut();
    await this.supabaseSession()
      ?.signOut()
      .catch(() => undefined);
    await this.announce();
  }

  async request(request: CommunityRequest): Promise<CommunityResponse> {
    const current = await this.token();
    const headers: Record<string, string> = { accept: request.picture ? "image/*" : "application/json" };
    if (current) {
      headers.authorization = `Bearer ${current.token}`;
    }
    if (request.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.communityUrl}${request.path}`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      return { kind: "unreachable", reason: `The community server at ${this.config.communityUrl} did not answer` };
    }
    if (request.picture) {
      const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      if (!response.ok || !PICTURE_TYPES.includes(type)) {
        return { kind: "picture", status: response.status, dataUrl: null };
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return { kind: "picture", status: response.status, dataUrl: `data:${type};base64,${bytes.toString("base64")}` };
    }
    const text = await response.text();
    let body: unknown = null;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { kind: "json", status: response.status, body };
  }
}
