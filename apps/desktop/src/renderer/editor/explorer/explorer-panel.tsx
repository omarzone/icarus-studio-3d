// PNL-EXPLORER
import { Plus } from "lucide-react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useCopilotOutbox } from "../../app/runtime/copilot-outbox.ts";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { type SceneObject, scenePort } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { useSceneCache, useSceneTree } from "../scene-queries.ts";
import { AddObjectMenu } from "./add-object-menu.tsx";
import { type ExplorerActions, ExplorerTab } from "./explorer-tab.tsx";

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
  const rename = useEngineAction(port.renameObject);
  const duplicate = useEngineAction(port.duplicateObject);
  const remove = useEngineAction(port.deleteObject);
  const reparent = useEngineAction(port.reparentObject);
  const ask = useCopilotOutbox((state) => state.ask);
  const app = useRuntimeMode() === "app";
  const edited = { onSuccess: cache.objects };
  const actions: ExplorerActions = {
    rename: (id, name) => rename.mutate({ scene, id, name }, edited),
    duplicate: (id) => duplicate.mutate({ scene, id }, edited),
    remove: (id) => remove.mutate({ scene, id }, edited),
    reparent: (id, parent) => reparent.mutate({ scene, id, parent }, edited),
    ask: (row) => ask(scene, `Tell me about ${row.name}: what it does in this project and how I could improve it.`),
  };
  return (
    <Panel
      id="PNL-EXPLORER"
      className={className}
      tabs={<PanelTab label={label} active />}
      options={
        app ? (
          <AddObjectMenu scene={scene} />
        ) : (
          <Act cta="Add object" aria-label="Add object" title="Add object" className={buttonClass("icon", "size-6!")}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
          </Act>
        )
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
            actions={actions}
            onSelect={(id) => select.mutate({ scene, id }, { onSuccess: cache.tree })}
          />
        )}
      </QueryView>
    </Panel>
  );
}
