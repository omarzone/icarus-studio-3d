// PNL-EXPLORER
import { Plus } from "lucide-react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type SceneObject, scenePort } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { useSceneCache, useSceneTree } from "../scene-queries.ts";
import { ExplorerTab } from "./explorer-tab.tsx";

export type ExplorerPanelProps = {
  // Scene key of the project document to show (scene port).
  scene: string;
  // Tab label: "Explorer" in World and Brain, "Rig" in Body, "Clip" in Motion.
  label?: string;
  // Called for action rows such as "Add an agent".
  onAction?: (row: SceneObject) => void;
  // Extra classes for the panel, usually its flex share in the column.
  className?: string;
};

export function ExplorerPanel({ scene, label = "Explorer", onAction, className = "flex-1" }: ExplorerPanelProps) {
  const port = usePort(scenePort);
  const tree = useSceneTree(scene);
  const cache = useSceneCache(scene);
  const select = useEngineAction(port.selectObject);
  return (
    <Panel
      id="PNL-EXPLORER"
      className={className}
      tabs={<PanelTab label={label} active />}
      options={
        <Act cta="Add object" aria-label="Add object" title="Add object" className={buttonClass("icon", "size-6!")}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      }
    >
      <QueryView
        query={tree}
        isEmpty={(data) => data.sections.length === 0}
        empty={<EmptyState title="Nothing in this project yet" body="Add an object with + or ask the copilot." />}
      >
        {(data) => (
          <ExplorerTab
            tree={data}
            onAction={onAction}
            onSelect={(id) => select.mutate({ scene, id }, { onSuccess: cache.tree })}
          />
        )}
      </QueryView>
    </Panel>
  );
}
