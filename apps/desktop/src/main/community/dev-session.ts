import type { SessionVault } from "./session-vault.ts";

// The account the app signs in as against a community server in development mode (no Supabase project).
export const DEV_EMAIL = "dev@icarus.localhost";
const VAULT_KEY = "dev:token";
// Ask for a new token a minute before the old one expires.
const EARLY_MS = 60_000;

type StoredToken = { token: string; expiresAt: number; server: string };

function readStored(text: string | null): StoredToken | null {
  if (text === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === "object" &&
      value !== null &&
      "token" in value &&
      "expiresAt" in value &&
      "server" in value &&
      typeof value.token === "string" &&
      typeof value.expiresAt === "number" &&
      typeof value.server === "string"
    ) {
      return { token: value.token, expiresAt: value.expiresAt, server: value.server };
    }
  } catch {
    // An unreadable token is the same as none.
  }
  return null;
}

// Development sign-in: the community server (DEV_AUTH on, never in production) signs a short-lived token; signing
// in keeps getting new ones until the person signs out.
export class DevSession {
  constructor(
    private readonly vault: SessionVault,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  signedIn(server: string): boolean {
    return readStored(this.vault.get(VAULT_KEY))?.server === server;
  }

  async signIn(server: string): Promise<string> {
    const response = await this.fetchFn(`${server}/v1/dev/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: DEV_EMAIL, name: "Developer" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) {
      throw new Error("This community server does not allow development sign-in; connect a Supabase project");
    }
    const body: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      typeof body !== "object" ||
      body === null ||
      !("access_token" in body) ||
      !("expires_in" in body) ||
      typeof body.access_token !== "string" ||
      typeof body.expires_in !== "number"
    ) {
      throw new Error(`The community server refused the development sign-in (${response.status})`);
    }
    const stored: StoredToken = { token: body.access_token, expiresAt: this.now() + body.expires_in * 1000, server };
    this.vault.set(VAULT_KEY, JSON.stringify(stored));
    return DEV_EMAIL;
  }

  async accessToken(server: string): Promise<{ token: string; email: string } | null> {
    const stored = readStored(this.vault.get(VAULT_KEY));
    if (stored === null || stored.server !== server) {
      return null;
    }
    if (stored.expiresAt - EARLY_MS > this.now()) {
      return { token: stored.token, email: DEV_EMAIL };
    }
    await this.signIn(server);
    const fresh = readStored(this.vault.get(VAULT_KEY));
    return fresh ? { token: fresh.token, email: DEV_EMAIL } : null;
  }

  signOut(): void {
    this.vault.remove(VAULT_KEY);
  }
}
