import { useNavigation } from "./navigation/navigation-store.tsx";
import type { Catalog } from "./navigation/route-registry.ts";
import { LauncherHeader } from "./shell/launcher-header/launcher-header.tsx";
import { WorkspaceHeader } from "./shell/workspace-header/workspace-header.tsx";
import { EngineDown } from "./system/engine-down.tsx";

export const catalog: Catalog = {
  routes: [
    {
      id: "SYS-ENGINE-DOWN",
      maxDiff: 0.03,
      component: EngineDownSample,
    },
  ],
  modules: [
    {
      id: "HDR-LAUNCHER",
      component: () => <LauncherHeader active="Home" account={{ initial: "O", signedIn: false }} unread />,
    },
    {
      id: "HDR-WORKSPACE",
      component: () => (
        <WorkspaceHeader
          project="Untitled project"
          active="World"
          guide="Guide"
          playEnabled={false}
          primary={{ label: "Train", to: "MOD-START-TRAINING", disabled: true }}
        />
      ),
    },
  ],
};

// In the app, restarting brings the engine back and the screen it covered; here it returns Home.
function EngineDownSample() {
  const go = useNavigation((state) => state.go);
  return (
    <EngineDown
      reason="engine exited with code 3 · 14:02:11"
      lastLog={["last message: health check timed out after 10 s"]}
      onRestart={() => go("SCR-HOME")}
      onCopy={() => undefined}
    />
  );
}
