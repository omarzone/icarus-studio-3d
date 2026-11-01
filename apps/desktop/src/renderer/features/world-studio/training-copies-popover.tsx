// POP-TRAINING-COPIES
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Act, CloseOverlay, GoTo, useCloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { SwitchToggle } from "../../editor/inspector/controls/switch-toggle.tsx";
import { parseNumber, ValueField } from "../../editor/inspector/controls/value-field.tsx";
import { sceneKeys } from "../../editor/scene-queries.ts";
import { scenePort, type TrainingCopies, type Variation } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Popover } from "../../ui/popover.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Select } from "../../ui/select.tsx";
import { useCopiesPreview } from "./copies-preview-store.ts";
import { WORLD_CONFIGS } from "./world-variants.ts";

const PREVIEW_CLASS = buttonClass("secondary", "h-8.5! px-4! text-body!");

// How many copies train in parallel and what changes between them, over the World workspace.
export function TrainingCopiesPopover() {
  const scene = useProjectKey(WORLD_CONFIGS.world.scene);
  return scene === null ? null : <TrainingCopiesCard scene={scene} />;
}

function TrainingCopiesCard({ scene }: { scene: string }) {
  const port = usePort(scenePort);
  const client = useQueryClient();
  const copies = useQuery({ queryKey: sceneKeys.copies(scene), queryFn: () => port.getTrainingCopies(scene) });
  // The project changed: the explorer, inspector, viewport and history read it again.
  const update = {
    onSuccess: (next: TrainingCopies) => {
      client.setQueryData(sceneKeys.copies(scene), next);
      void client.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] === "scene" && query.queryKey[1] === scene && query.queryKey[2] !== "copies") ||
          query.queryKey[0] === "projects" ||
          query.queryKey[0] === "revisions",
      });
    },
  };
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
        <QueryView query={copies} errorTitle="The training copies could not be loaded">
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
              {data.variations.length === 0 ? (
                <p className="text-ui text-fg-tertiary">Add props or a ground to the world to vary them.</p>
              ) : null}
              {data.variations.map((variation) => (
                <VariationRow
                  key={variation.id}
                  variation={variation}
                  onToggle={() => {
                    if (!toggle.isPending) {
                      toggle.mutate({ scene, id: variation.id }, update);
                    }
                  }}
                />
              ))}
            </>
          )}
        </QueryView>
        <div className="flex justify-end gap-2">
          <PreviewCopies scene={scene} />
          <CloseOverlay cta="Done" className={buttonClass("primary", "h-8.5! text-body!")}>
            Done
          </CloseOverlay>
        </div>
      </div>
    </Popover>
  );
}

// The app shows the copies in the World viewport; the prototype keeps the design's timelapse link.
function PreviewCopies({ scene }: { scene: string }) {
  const mode = useRuntimeMode();
  const show = useCopiesPreview((state) => state.show);
  const close = useCloseOverlay();
  if (mode === "prototype") {
    return (
      <GoTo to="SCR-TIMELAPSE" cta="Preview copies" className={PREVIEW_CLASS}>
        Preview copies
      </GoTo>
    );
  }
  return (
    <Act
      cta="Preview copies"
      title="Shows every copy's first try in the viewport"
      onClick={() => {
        show(scene);
        close();
      }}
      className={PREVIEW_CLASS}
    >
      Preview copies
    </Act>
  );
}

function VariationRow({ variation, onToggle }: { variation: Variation; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5 text-ui">
      <SwitchToggle label={variation.label} on={variation.enabled} onToggle={onToggle} />
      <span className="flex min-w-0 flex-1 flex-col">
        {variation.label}
        {variation.objects && variation.objects.length > 0 ? (
          <span className="truncate text-meta text-fg-tertiary" title={variation.objects.join(", ")}>
            {variation.objects.join(", ")}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-fg-tertiary">{variation.enabled ? variation.detail : "off"}</span>
    </div>
  );
}
