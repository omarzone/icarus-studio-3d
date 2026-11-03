import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CommunityConnectionInput } from "../../shared/community-bridge.ts";
import { isRecord } from "../../shared/community-bridge.ts";

// The community server and Supabase project the app uses, kept in `community.json` in the settings folder (the
// same folder as the engine's settings). Switching to another server is changing `community_url` there or in
// Settings › Profile › Community server.

export const DEFAULT_COMMUNITY_URL = "http://127.0.0.1:8790";
export const CONFIG_FILE = "community.json";

export type CommunityConfig = { communityUrl: string; supabaseUrl: string; supabaseAnonKey: string };

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

export function parseConfig(text: string): CommunityConfig {
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
    communityUrl: safe(stringField(record, "community_url"), "Community server") || DEFAULT_COMMUNITY_URL,
    supabaseUrl: safe(stringField(record, "supabase_url"), "Supabase URL"),
    supabaseAnonKey: stringField(record, "supabase_anon_key").trim(),
  };
}

export function readConfig(folder: string = settingsDir()): CommunityConfig {
  try {
    return parseConfig(readFileSync(join(folder, CONFIG_FILE), "utf8"));
  } catch {
    return parseConfig("{}");
  }
}

export function applyInput(current: CommunityConfig, input: CommunityConnectionInput): CommunityConfig {
  return {
    communityUrl: serverAddress(input.communityUrl, "Community server") || DEFAULT_COMMUNITY_URL,
    supabaseUrl: serverAddress(input.supabaseUrl, "Supabase URL"),
    supabaseAnonKey: input.supabaseAnonKey === undefined ? current.supabaseAnonKey : input.supabaseAnonKey.trim(),
  };
}

export function writeConfig(config: CommunityConfig, folder: string = settingsDir()): void {
  const path = join(folder, CONFIG_FILE);
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(
    { community_url: config.communityUrl, supabase_url: config.supabaseUrl, supabase_anon_key: config.supabaseAnonKey },
    null,
    2,
  );
  writeFileSync(`${path}.tmp`, `${text}\n`, "utf8");
  renameSync(`${path}.tmp`, path);
}
