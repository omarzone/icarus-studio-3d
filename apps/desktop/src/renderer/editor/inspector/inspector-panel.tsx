// PNL-INSPECTOR
import { Ellipsis } from "lucide-react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { scenePort } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { useInspection, useSceneCache } from "../scene-queries.ts";
import type { PanelRoutes } from "./controls/property-control.tsx";
import { PropertiesTab } from "./properties-tab.tsx";

export type InspectorPanelProps = {
  // Scene key of the project document whose selection is edited (scene port).
  scene: string;
  // Tab label, "Properties" by default.
  label?: string;
  // Where "+ Add component" leads (POP-ADD-COMPONENT); omit for runs, brains and clips, which have no components.
  addComponentTo?: RouteId;
  // Where "Opens a panel" properties lead in this workspace (training copies, brain sizes…).
  panelRoutes?: PanelRoutes;
  className?: string;
};

export function InspectorPanel({
  scene,
  label = "Properties",
  addComponentTo,
  panelRoutes,
  className = "flex-[1.1]",
}: InspectorPanelProps) {
  return (
    <Panel
      id="PNL-INSPECTOR"
      className={className}
      tabs={<PanelTab label={label} active />}
      options={
        <Act cta="Inspector options" aria-label="Inspector options" className={buttonClass("icon", "size-6!")}>
          <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      }
    >
      <InspectorBody scene={scene} addComponentTo={addComponentTo} panelRoutes={panelRoutes} />
    </Panel>
  );
}

type BodyProps = Pick<InspectorPanelProps, "scene" | "addComponentTo" | "panelRoutes"> & { board?: boolean };

// The inspector content without its panel, for boards and dialogs that show an object's components.
export function InspectorBody({ scene, addComponentTo, panelRoutes, board }: BodyProps) {
  const port = usePort(scenePort);
  const inspection = useInspection(scene);
  const cache = useSceneCache(scene);
  const set = useEngineAction(port.setProperty);
  const reset = useEngineAction(port.resetProperty);
  const accept = useEngineAction(port.acceptProposedValue);
  return (
    <QueryView query={inspection}>
      {(data) => (
        <PropertiesTab
          inspection={data}
          board={board}
          addComponentTo={addComponentTo}
          panelRoutes={panelRoutes}
          onChange={(target, value) => set.mutate({ scene, ...target, value }, { onSuccess: cache.inspection })}
          onReset={(target) => reset.mutate({ scene, ...target }, { onSuccess: cache.inspection })}
          onAccept={(target) => accept.mutate({ scene, ...target }, { onSuccess: cache.inspection })}
        />
      )}
    </QueryView>
  );
}
