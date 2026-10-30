import type { ReactElement } from "react";
import { EngineDown } from "../app/system/engine-down.tsx";

// Fixture renders of catalog IDs for design parity checks (tests/design). Development only.
export const galleryRegistry: Record<string, () => ReactElement> = {
  "SYS-ENGINE-DOWN": () => (
    <EngineDown
      lastLog={["engine exited with code 3 · 14:02:11", "last message: health check timed out after 10 s"]}
      onRestart={() => undefined}
      onCopy={() => undefined}
    />
  ),
};
