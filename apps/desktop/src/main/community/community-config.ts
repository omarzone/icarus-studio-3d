import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord } from "../../shared/community-bridge.ts";

// The community server and Supabase project the app uses. A release carries them from its build (MAIN_VITE_*
// variables), so people never set them; `community.json` in the settings folder overrides any of them, for
// development against another server. Only the public anon key ever ships: server secrets stay on the server.

export const DEFAULT_COMMUNITY_URL = "http://127.0.0.1:8790";
export const CONFIG_FILE = "community.json";

export type CommunityConfig = { communityUrl: string; supabaseUrl: string; supabaseAnonKey: string };

export const BUILT_CONFIG: CommunityConfig = {
  communityUrl: import.meta.env.MAIN_VITE_COMMUNITY_URL ?? "",
  supabaseUrl: import.meta.env.MAIN_VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ?? "",
};

export function settingsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICARUS_SETTINGS_DIR || join(homedir(), ".icarus");
}

// An http(s) address without a trailing slash, path, query or credentials; anything else is refused.
export function serverAddress(text: string, label: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label} is not a web address`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must start with http:// or https://`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${label} must be just the server address, like https://community.example.org`);
  }
  return url.origin;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function parseConfig(text: string, built: CommunityConfig = BUILT_CONFIG): CommunityConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const record: Record<string, unknown> = isRecord(parsed) ? parsed : {};
  const safe = (value: string, label: string) => {
    try {
      return serverAddress(value, label);
    } catch {
      return "";
    }
  };
  return {
    communityUrl:
      safe(stringField(record, "community_url"), "Community server") ||
      safe(built.communityUrl, "Community server") ||
      DEFAULT_COMMUNITY_URL,
    supabaseUrl: safe(stringField(record, "supabase_url"), "Supabase URL") || safe(built.supabaseUrl, "Supabase URL"),
    supabaseAnonKey: stringField(record, "supabase_anon_key").trim() || built.supabaseAnonKey.trim(),
  };
}

export function readConfig(folder: string = settingsDir()): CommunityConfig {
  try {
    return parseConfig(readFileSync(join(folder, CONFIG_FILE), "utf8"));
  } catch {
    return parseConfig("{}");
  }
}
