// SCR-WORLD · STA-WORLD-EMPTY · STA-WORLD-EMPTY-NOGUIDE · STA-WORLD-BUILDING · STA-WORLD-PROPOSAL
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { ErrorState, LoadingState } from "../../ui/states.tsx";
import { useWorldScene } from "./use-world-scene.ts";
import { BuildingWorld } from "./world-building.tsx";
import { WORLD_CONFIGS, WORLD_VARIANTS, type WorldConfig, type WorldVariant } from "./world-variants.ts";
import { WorldWorkspace } from "./world-workspace.tsx";

// The World workspace; the route decides which state it shows (new project, building, proposal…).
export function WorldScreen() {
  const screen = useNavigation((state) => state.screen);
  const variant = WORLD_VARIANTS[screen] ?? "world";
  const config = WORLD_CONFIGS[variant];
  return variant === "building" ? (
    <BuildingWorld config={config} />
  ) : (
    <EditableWorld variant={variant} config={config} />
  );
}

function EditableWorld({ variant, config }: { variant: WorldVariant; config: WorldConfig }) {
  const world = useWorldScene(config.scene);
  switch (world.kind) {
    case "ready":
      return <WorldWorkspace variant={variant} config={config} scene={world.scene} />;
    case "creating":
      return <LoadingState label="Creating your project" />;
    case "failed":
      return (
        <ErrorState
          title="The project could not be created"
          detail={world.reason}
          action={
            <Act cta="Try again" onClick={world.retry} className={buttonClass("primary")}>
              Try again
            </Act>
          }
        />
      );
  }
}
