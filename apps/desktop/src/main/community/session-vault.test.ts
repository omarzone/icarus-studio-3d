import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { SecretBox } from "./session-vault.ts";
import { SessionVault } from "./session-vault.ts";

// Stands in for the keychain: reversible, and nothing readable reaches the disk.
const keychain: SecretBox = {
  available: () => true,
  encrypt: (text) => Buffer.from(text).reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString(),
};

it("keeps secrets encrypted on disk and reads them back after a restart", () => {
  const path = join(mkdtempSync(join(tmpdir(), "vault-")), "session.bin");
  new SessionVault(path, keychain).set("supabase:token", "refresh-secret");

  expect(readFileSync(path).toString()).not.toContain("refresh-secret");
  expect(new SessionVault(path, keychain).get("supabase:token")).toBe("refresh-secret");
});

it("writes nothing when no keychain can encrypt", () => {
  const path = join(mkdtempSync(join(tmpdir(), "vault-")), "session.bin");
  const vault = new SessionVault(path, { ...keychain, available: () => false });
  vault.set("dev:token", "secret");

  expect(vault.get("dev:token")).toBe("secret");
  expect(existsSync(path)).toBe(false);
});

it("signing out removes the file", () => {
  const path = join(mkdtempSync(join(tmpdir(), "vault-")), "session.bin");
  const vault = new SessionVault(path, keychain);
  vault.set("dev:token", "secret");
  vault.clear();

  expect(existsSync(path)).toBe(false);
  expect(new SessionVault(path, keychain).get("dev:token")).toBeNull();
});
