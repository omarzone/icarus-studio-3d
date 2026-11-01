import { expect, it } from "vitest";
import { createNavigationStore } from "./navigation-store.tsx";

const start = { screen: "SCR-HOME", overlay: null, params: {} } as const;

it("opens a dialog over the current screen and closes back to it", () => {
  const store = createNavigationStore(start);
  store.getState().go("SCR-WORLD", { project: "park-pilot" });
  store.getState().go("MOD-RENAME");
  expect(store.getState()).toMatchObject({
    screen: "SCR-WORLD",
    overlay: "MOD-RENAME",
    params: { project: "park-pilot" },
  });
  store.getState().close();
  expect(store.getState()).toMatchObject({ screen: "SCR-WORLD", overlay: null });
});

it("goes back to the previous screen with its parameters", () => {
  const store = createNavigationStore(start);
  store.getState().go("SCR-WORLD", { project: "park-pilot" });
  store.getState().go("SCR-TRAIN");
  store.getState().go("SCR-HOME", {});
  store.getState().back();
  expect(store.getState()).toMatchObject({ screen: "SCR-TRAIN", params: { project: "park-pilot" } });
});
