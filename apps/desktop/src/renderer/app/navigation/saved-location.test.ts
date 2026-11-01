import { describe, expect, it } from "vitest";
import { createNavigationStore } from "./navigation-store.tsx";
import { keepLocation, savedLocation } from "./saved-location.tsx";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

const HOME = { screen: "SCR-HOME", overlay: null, params: {} } as const;

describe("saved location", () => {
  it("brings a person back to the screen and project they were on after the window reloads", () => {
    const storage = memoryStorage();
    const before = createNavigationStore(HOME);
    keepLocation(before, storage);
    before.getState().go("SCR-TRAIN", { project: "274ac06344d9" });
    before.getState().go("MOD-START-TRAINING");

    const after = savedLocation(storage, HOME);
    expect(after).toEqual({ screen: "SCR-TRAIN", overlay: null, params: { project: "274ac06344d9" } });
  });

  it("starts at home when nothing was saved or what was saved cannot be read", () => {
    const storage = memoryStorage();
    expect(savedLocation(storage, HOME)).toEqual(HOME);
    storage.setItem("icarus.location", "{not json");
    expect(savedLocation(storage, HOME)).toEqual(HOME);
    storage.setItem("icarus.location", JSON.stringify({ screen: "MOD-RENAME", params: {} }));
    expect(savedLocation(storage, HOME)).toEqual(HOME);
    storage.setItem("icarus.location", JSON.stringify({ screen: "SCR-WORLD", params: { project: 7 } }));
    expect(savedLocation(storage, HOME)).toEqual(HOME);
  });

  it("never brings a person back to the engine-stopped screen", () => {
    const storage = memoryStorage();
    storage.setItem("icarus.location", JSON.stringify({ screen: "SYS-ENGINE-DOWN", params: {} }));
    expect(savedLocation(storage, HOME)).toEqual(HOME);
  });
});
