import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignInProviderId, SignInResult } from "../../shared/community-bridge.ts";
import type { CallbackWait } from "./loopback-callback.ts";
import type { SessionVault } from "./session-vault.ts";

const SIGN_IN_WAIT_MS = 10 * 60_000;
const VAULT_PREFIX = "supabase:";

export type SupabaseProject = { url: string; anonKey: string };

export type SessionDeps = {
  vault: SessionVault;
  openExternal: (url: string) => Promise<void>;
  waitForCallback: (timeoutMs: number) => Promise<CallbackWait>;
};

// Supabase Auth in the main process with PKCE: OAuth opens the system browser and a sign-in link arrives by email;
// both come back to the loopback callback with a one-time code that only this process can exchange.
export class SupabaseSession {
  private client: Promise<SupabaseClient> | null = null;
  private pending: CallbackWait | null = null;

  constructor(
    private readonly project: SupabaseProject,
    private readonly deps: SessionDeps,
  ) {}

  private auth(): Promise<SupabaseClient> {
    if (this.client === null) {
      const vault = this.deps.vault;
      this.client = import("@supabase/supabase-js").then(({ createClient }) =>
        createClient(this.project.url, this.project.anonKey, {
          auth: {
            flowType: "pkce",
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: {
              getItem: async (key) => vault.get(`${VAULT_PREFIX}${key}`),
              setItem: async (key, value) => vault.set(`${VAULT_PREFIX}${key}`, value),
              removeItem: async (key) => vault.remove(`${VAULT_PREFIX}${key}`),
            },
          },
        }),
      );
    }
    return this.client;
  }

  async signIn(provider: SignInProviderId, email: string | undefined): Promise<SignInResult> {
    const client = await this.auth();
    this.pending?.close();
    const wait = await this.deps.waitForCallback(SIGN_IN_WAIT_MS);
    this.pending = wait;
    try {
      if (provider === "email") {
        const address = email?.trim() ?? "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
          wait.close();
          return { kind: "failed", reason: "Enter your email address" };
        }
        const { error } = await client.auth.signInWithOtp({ email: address, options: { emailRedirectTo: wait.url } });
        if (error) {
          wait.close();
          return { kind: "failed", reason: error.message };
        }
        // The link can be opened later; the callback keeps waiting and finishes the sign-in on its own.
        void this.finish(wait).catch(() => undefined);
        return { kind: "link-sent", email: address };
      }
      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: wait.url, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        wait.close();
        return { kind: "failed", reason: error?.message ?? "Supabase gave no sign-in page" };
      }
      await this.deps.openExternal(data.url);
      const signedIn = await this.finish(wait);
      return { kind: "signed-in", email: signedIn };
    } catch (error) {
      wait.close();
      return { kind: "failed", reason: error instanceof Error ? error.message : "Sign-in failed" };
    }
  }

  private async finish(wait: CallbackWait): Promise<string> {
    const params = await wait.done;
    const code = params.get("code");
    if (!code) {
      throw new Error("The sign-in page came back without a code");
    }
    const client = await this.auth();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(error.message);
    }
    this.onChange?.();
    return data.session.user.email ?? "";
  }

  onChange: (() => void) | null = null;

  // A fresh access token (refreshed when it is about to expire), or null when nobody is signed in.
  async accessToken(): Promise<{ token: string; email: string } | null> {
    const client = await this.auth();
    const { data } = await client.auth.getSession();
    if (!data.session) {
      return null;
    }
    return { token: data.session.access_token, email: data.session.user.email ?? "" };
  }

  async signOut(): Promise<void> {
    this.pending?.close();
    const client = await this.auth();
    await client.auth.signOut({ scope: "local" });
  }
}
