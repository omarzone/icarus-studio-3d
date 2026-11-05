import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CONFIG_FILE, DEFAULT_COMMUNITY_URL, parseConfig, readConfig, serverAddress } from "./community-config.ts";

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

it("uses the connection the release was built with unless the settings file overrides it", () => {
  const built = {
    communityUrl: "https://community.example.org",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
  };
  expect(parseConfig("{}", built)).toEqual(built);
  expect(parseConfig('{"community_url": "http://127.0.0.1:9000"}', built)).toEqual({
    ...built,
    communityUrl: "http://127.0.0.1:9000",
  });
});
