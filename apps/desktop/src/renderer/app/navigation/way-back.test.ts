import { expect, it } from "vitest";
import { createNavigationStore } from "./navigation-store.tsx";
import { takeWayBack, wayBack } from "./way-back.ts";

const HOME = { screen: "SCR-HOME", overlay: null, params: {} } as const;
const PROJECT = { project: "274ac06344d9" };

function leave(store: ReturnType<typeof createNavigationStore>): void {
  const way = wayBack(store.getState());
  if (!way) {
    throw new Error("no way back");
  }
  takeWayBack(store.getState(), way);
}

it("leaves settings for the project and workspace they were opened from, after any number of settings pages", () => {
  const store = createNavigationStore(HOME);
  store.getState().go("SCR-WORLD", PROJECT);
  store.getState().go("SCR-TRAIN");
  store.getState().go("SCR-SETTINGS-TRAINING");
  store.getState().go("SCR-SETTINGS-MODELS");
  store.getState().go("SCR-SETTINGS-PRIVACY", { focus: "blocked" });

  expect(wayBack(store.getState())).toMatchObject({ label: "Back to project", to: "SCR-TRAIN" });
  leave(store);

  expect(store.getState()).toMatchObject({ screen: "SCR-TRAIN", overlay: null, params: PROJECT });
  expect(store.getState().history.map((entry) => entry.screen)).toEqual(["SCR-HOME", "SCR-WORLD"]);
});

it("leaves settings opened from a launcher page for that page, and settings with no past for Home", () => {
  const fromProjects = createNavigationStore(HOME);
  fromProjects.getState().go("SCR-PROJECTS");
  fromProjects.getState().go("SCR-SETTINGS-MODELS");
  expect(wayBack(fromProjects.getState())).toMatchObject({ label: "Back to Projects", to: "SCR-PROJECTS" });

  const opened = createNavigationStore({ screen: "SCR-SETTINGS-TRAINING", overlay: null, params: {} });
  expect(wayBack(opened.getState())).toEqual({ label: "Back to Home", index: null, to: "SCR-HOME" });
  leave(opened);
  expect(opened.getState().screen).toBe("SCR-HOME");
});

it("offers the launcher pages a way back only to a saved project", () => {
  const store = createNavigationStore(HOME);
  store.getState().go("SCR-COMMUNITY");
  expect(wayBack(store.getState())).toBeNull();

  store.getState().go("SCR-WORLD", { template: "parking_car" });
  store.getState().go("SCR-PROFILE");
  expect(wayBack(store.getState())).toBeNull();

  store.getState().go("SCR-BODY", PROJECT);
  store.getState().go("SCR-COMMUNITY");
  store.getState().go("SCR-CREATION", { creation: "valet-bot" });
  store.getState().go("SCR-PROFILE");
  leave(store);
  expect(store.getState()).toMatchObject({ screen: "SCR-BODY", params: PROJECT });
});

it("gives a workspace no way back of its own", () => {
  const store = createNavigationStore(HOME);
  store.getState().go("SCR-WORLD", PROJECT);
  expect(wayBack(store.getState())).toBeNull();
});
