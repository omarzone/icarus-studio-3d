// POP-TRAINING-COPIES
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { SwitchToggle } from "../../editor/inspector/controls/switch-toggle.tsx";
import { parseNumber, ValueField } from "../../editor/inspector/controls/value-field.tsx";
import { sceneKeys } from "../../editor/scene-queries.ts";
import { scenePort, type TrainingCopies, type Variation } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Popover } from "../../ui/popover.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Select } from "../../ui/select.tsx";
import { WORLD_CONFIGS } from "./world-variants.ts";

// How many copies train in parallel and what changes between them, over the World workspace.
export function TrainingCopiesPopover() {
  const scene = WORLD_CONFIGS.world.scene;
  const port = usePort(scenePort);
  const client = useQueryClient();
  const copies = useQuery({ queryKey: sceneKeys.copies(scene), queryFn: () => port.getTrainingCopies(scene) });
  const update = { onSuccess: (next: TrainingCopies) => client.setQueryData(sceneKeys.copies(scene), next) };
  const set = useEngineAction(port.setTrainingCopies);
  const toggle = useEngineAction(port.toggleVariation);
  return (
    <Popover anchor={{ top: 160, left: 640 }} width="w-90" scrim>
      <div className="flex flex-col gap-3">
        <div className="flex items-center">
          <h2 className="font-semibold">Training copies</h2>
          <CloseOverlay
            cta=""
            aria-label="Close"
            className={buttonClass("icon", "-my-1 -mr-1 ml-auto size-7! text-fg-tertiary!")}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </CloseOverlay>
        </div>
        <QueryView query={copies}>
          {(data) => (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-ui text-fg-secondary">Copies</span>
                  <ValueField
                    label="Copies"
                    value={String(data.copies)}
                    onCommit={(text) => {
                      const number = parseNumber(text);
                      if (number === null || number < 1) {
                        return false;
                      }
                      set.mutate({ scene, copies: Math.round(number), layout: data.layout }, update);
                      return true;
                    }}
                    className="h-9 rounded-button bg-control px-3 text-ui hover:bg-control-raised focus:bg-control-raised"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-ui text-fg-secondary">Layout</span>
                  <Select
                    label="Layout"
                    value={data.layout}
                    options={data.layouts.map((layout) => ({ value: layout, label: layout }))}
                    onChange={(layout) => set.mutate({ scene, copies: data.copies, layout }, update)}
                    className="h-9 rounded-button bg-control px-3 text-body hover:bg-control-raised"
                  />
                </div>
              </div>
              <p className="text-ui leading-normal text-fg-secondary">
                Every copy is a little different, so the brain does not memorize one lot.
              </p>
              <h3 className="text-ui font-semibold">Change on every try</h3>
              {data.variations.map((variation) => (
                <VariationRow
                  key={variation.id}
                  variation={variation}
                  onToggle={() => toggle.mutate({ scene, id: variation.id }, update)}
                />
              ))}
            </>
          )}
        </QueryView>
        <div className="flex justify-end gap-2">
          <GoTo to="SCR-TIMELAPSE" cta="Preview copies" className={buttonClass("secondary", "h-8.5! px-4! text-body!")}>
            Preview copies
          </GoTo>
          <CloseOverlay cta="Done" className={buttonClass("primary", "h-8.5! text-body!")}>
            Done
          </CloseOverlay>
        </div>
      </div>
    </Popover>
  );
}

function VariationRow({ variation, onToggle }: { variation: Variation; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5 text-ui">
      <SwitchToggle label={variation.label} on={variation.enabled} onToggle={onToggle} />
      <span className="flex-1">{variation.label}</span>
      <span className="font-mono text-fg-tertiary">{variation.enabled ? variation.detail : "off"}</span>
    </div>
  );
}
