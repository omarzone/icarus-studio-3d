import type { ReactElement } from "react";
import { LauncherHeader } from "../app/shell/launcher-header/launcher-header.tsx";
import { WorkspaceHeader } from "../app/shell/workspace-header/workspace-header.tsx";
import { EngineDown } from "../app/system/engine-down.tsx";

// Fixture renders of catalog IDs for design parity checks (tests/design). Development only.
export const galleryRegistry: Record<string, () => ReactElement> = {
  "HDR-LAUNCHER": () => <LauncherHeader active="Home" />,
  "HDR-WORKSPACE": () => <WorkspaceHeader project="Untitled project" active="World" primary="Train" />,
  "SYS-ENGINE-DOWN": () => (
    <EngineDown
      reason="engine exited with code 3 · 14:02:11"
      lastLog={["last message: health check timed out after 10 s"]}
      onRestart={() => undefined}
      onCopy={() => undefined}
    />
  ),
};
