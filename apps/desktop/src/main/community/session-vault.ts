import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Encrypts with the operating system's keychain (Electron safeStorage in the app, a fake in tests).
export type SecretBox = {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
};

// Sign-in secrets (Supabase's session, a development token) kept only in the main process. They reach the disk
// encrypted by the keychain; where no keychain is available they live in memory until the app quits.
export class SessionVault {
  private values = new Map<string, string>();

  constructor(
    private readonly path: string,
    private readonly box: SecretBox,
  ) {
    this.values = this.load();
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
    this.save();
  }

  remove(key: string): void {
    this.values.delete(key);
    this.save();
  }

  clear(): void {
    this.values.clear();
    rmSync(this.path, { force: true });
  }

  private load(): Map<string, string> {
    if (!this.box.available()) {
      return new Map();
    }
    try {
      const parsed: unknown = JSON.parse(this.box.decrypt(readFileSync(this.path)));
      if (typeof parsed !== "object" || parsed === null) {
        return new Map();
      }
      return new Map(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch {
      return new Map();
    }
  }

  private save(): void {
    if (!this.box.available()) {
      return;
    }
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, this.box.encrypt(JSON.stringify(Object.fromEntries(this.values))));
    renameSync(`${this.path}.tmp`, this.path);
  }
}
