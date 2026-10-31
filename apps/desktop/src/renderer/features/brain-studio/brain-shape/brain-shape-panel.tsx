// PNL-BRAIN-SHAPE
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type BrainShape, brainPort } from "../../../ports/brain-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { ShapeTab } from "./shape-tab.tsx";

export const brainShapeKey = (brain: string) => ["brain", brain, "shape"] as const;

type Props = { brain: string; addLayerTo?: RouteId };

export function BrainShapePanel({ brain, addLayerTo }: Props) {
  const port = usePort(brainPort);
  const client = useQueryClient();
  const query = useQuery({ queryKey: brainShapeKey(brain), queryFn: () => port.getShape(brain) });
  const update = { onSuccess: (next: BrainShape) => client.setQueryData(brainShapeKey(brain), next) };
  const setLayer = useEngineAction(port.setLayerSize);
  const setRate = useEngineAction(port.setDecisionsPerSecond);
  const toggleRule = useEngineAction(port.toggleRule);
  const addLayer = useEngineAction(port.addLayer);
  return (
    <Panel id="PNL-BRAIN-SHAPE" className="flex-1" tabs={<PanelTab label="Shape" active />}>
      <QueryView query={query}>
        {(shape) => (
          <ShapeTab
            shape={shape}
            addLayerTo={addLayerTo}
            onLayer={(id, neurons) => setLayer.mutate({ brain, id, neurons }, update)}
            onRate={(value) => setRate.mutate({ brain, value }, update)}
            onRule={(id) => toggleRule.mutate({ brain, id }, update)}
            onAddLayer={() => addLayer.mutate(brain, update)}
          />
        )}
      </QueryView>
    </Panel>
  );
}
