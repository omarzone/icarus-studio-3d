import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  applyInput,
  CONFIG_FILE,
  DEFAULT_COMMUNITY_URL,
  readConfig,
  serverAddress,
  writeConfig,
} from "./community-config.ts";

it("keeps only the origin of a server address and refuses anything else", () => {
  expect(serverAddress(" https://community.example.org/ ", "Server")).toBe("https://community.example.org");
  expect(serverAddress("", "Server")).toBe("");
  for (const bad of [
    "community.example.org",
    "file:///etc/passwd",
    "https://user:secret@community.example.org",
    "https://community.example.org/api",
    "https://community.example.org?next=evil",
  ]) {
    expect(() => serverAddress(bad, "Server"), bad).toThrow();
  }
});

it("falls back to the local server when the file is missing or unreadable", () => {
  const folder = mkdtempSync(join(tmpdir(), "community-config-"));
  expect(readConfig(folder)).toEqual({ communityUrl: DEFAULT_COMMUNITY_URL, supabaseUrl: "", supabaseAnonKey: "" });

  writeFileSync(join(folder, CONFIG_FILE), '{"community_url": "javascript:alert(1)", "supabase_url": 4');
  expect(readConfig(folder).communityUrl).toBe(DEFAULT_COMMUNITY_URL);
});

it("saves the server and keeps the stored key unless a new one is given", () => {
  const folder = mkdtempSync(join(tmpdir(), "community-config-"));
  const first = applyInput(readConfig(folder), {
    communityUrl: "https://community.example.org",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
  });
  writeConfig(first, folder);
  const second = applyInput(readConfig(folder), { communityUrl: "", supabaseUrl: "https://project.supabase.co" });

  expect(second).toEqual({
    communityUrl: DEFAULT_COMMUNITY_URL,
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
  });
  expect(JSON.parse(readFileSync(join(folder, CONFIG_FILE), "utf8"))).toEqual({
    community_url: "https://community.example.org",
    supabase_url: "https://project.supabase.co",
    supabase_anon_key: "anon-key",
  });
});
