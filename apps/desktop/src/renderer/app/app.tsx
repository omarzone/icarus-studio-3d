import { useEffect, useState } from "react";
import type { EngineStatus } from "../../shared/engine-bridge.ts";
import { RememberWorkspace } from "../features/project/last-workspace.ts";
import { AppProviders, HOME } from "./app-providers.tsx";
import { Router } from "./navigation/router.tsx";
import { RememberLocation, savedLocation } from "./navigation/saved-location.tsx";
import { useOpenProjectShortcut } from "./shell/open-project-shortcut.ts";
import { EngineDown } from "./system/engine-down.tsx";

export function App() {
  const [status, setStatus] = useState<EngineStatus>({ kind: "starting" });

  useEffect(() => {
    void window.icarus.engine.status().then(setStatus);
    return window.icarus.engine.onStatus(setStatus);
  }, []);

  if (status.kind === "down") {
    return (
      <EngineDown
        reason={status.reason}
        lastLog={status.lastLog}
        onRestart={() => void window.icarus.engine.restart()}
        onCopy={(text) => void navigator.clipboard.writeText(text)}
      />
    );
  }
  return (
    <AppProviders mode="app" initial={savedLocation(window.sessionStorage, HOME)}>
      <RememberLocation storage={window.sessionStorage} />
      <RememberWorkspace />
      <AppShortcuts />
      <Router />
    </AppProviders>
  );
}

function AppShortcuts() {
  useOpenProjectShortcut();
  return null;
}
