import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { DataFolderMove, StorageSettings } from "../../ports/settings-port.ts";
import { DataFolderCard, ENVIRONMENT_REASON, MoveResult } from "./storage-views.tsx";

const IDLE: DataFolderMove = { state: "idle", folder: null, progress: 0, text: "", lines: [], restartNeeded: false };

const STORAGE: StorageSettings = {
  dataFolder: "D:\\Icarus",
  projectsFolder: "D:\\Icarus\\projects",
  runsFolder: "D:\\Icarus\\runs",
  projectsBytes: 640_000_000,
  runsBytes: 1_800_000_000,
  freeBytes: 120_000_000_000,
  setByEnvironment: false,
  move: IDLE,
};

const noop = () => {};

it("shows the data folder, what projects and runs use and what the drive has free", () => {
  const html = renderToStaticMarkup(<DataFolderCard storage={STORAGE} busy={false} onChange={noop} />);
  expect(html).toContain("D:\\Icarus");
  expect(html).toContain("Projects 640 MB · Runs 1.8 GB · 120 GB free on this drive");
  expect(html).not.toMatch(/data-cta="change-folder"[^>]*disabled=""/);
});

it("locks the folder when the environment sets it, and says why", () => {
  const html = renderToStaticMarkup(
    <DataFolderCard storage={{ ...STORAGE, setByEnvironment: true }} busy={false} onChange={noop} />,
  );
  expect(html).toMatch(/data-cta="change-folder"[^>]*disabled=""/);
  expect(html).toContain(ENVIRONMENT_REASON);
});

it("lists what moved and what stayed behind, and why a failed move changed nothing", () => {
  const done = renderToStaticMarkup(
    <MoveResult
      move={{
        ...IDLE,
        state: "done",
        lines: ["Moved 3 projects from C:\\a to D:\\b", "Left run-1 in place: its status cannot be read"],
      }}
      onDismiss={noop}
    />,
  );
  expect(done).toContain("The data folder changed");
  expect(done).toContain("Left run-1 in place: its status cannot be read");

  const failed = renderToStaticMarkup(
    <MoveResult
      move={{ ...IDLE, state: "failed", text: "The data folder did not change: disk full" }}
      onDismiss={noop}
    />,
  );
  expect(failed).toContain("The data folder did not change: disk full");
});
