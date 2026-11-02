import { describe, expect, it } from "vitest";
import { createNavigationStore } from "../../app/navigation/navigation-store.tsx";
import { keepLastWorkspace, lastWorkspace } from "./last-workspace.ts";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

const HOME = { screen: "SCR-HOME", overlay: null, params: {} } as const;

describe("last workspace", () => {
  it("reopens each project in the workspace the person left it in", () => {
    const storage = memoryStorage();
    const store = createNavigationStore(HOME);
    keepLastWorkspace(store, storage);
    store.getState().go("SCR-TRAIN", { project: "a" });
    store.getState().go("MOD-START-TRAINING");
    store.getState().go("SCR-BRAIN", { project: "b" });
    store.getState().go("SCR-PROJECTS", {});

    expect(lastWorkspace(storage, "a")).toBe("SCR-TRAIN");
    expect(lastWorkspace(storage, "b")).toBe("SCR-BRAIN");
  });

  it("opens World when nothing was saved, the entry is not a workspace or storage fails", () => {
    const storage = memoryStorage();
    storage.setItem("icarus.workspace.a", "SCR-SETTINGS");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(lastWorkspace(storage, "new")).toBe("SCR-WORLD");
    expect(lastWorkspace(storage, "a")).toBe("SCR-WORLD");
    expect(lastWorkspace(broken, "a")).toBe("SCR-WORLD");
    const store = createNavigationStore(HOME);
    keepLastWorkspace(store, broken);
    expect(() => store.getState().go("SCR-TRAIN", { project: "a" })).not.toThrow();
  });
});
