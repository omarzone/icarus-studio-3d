// TAB-SHAPE
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { BrainShape } from "../../../ports/brain-port.ts";
import { MIN_DECISIONS } from "../../../ports/brain-shape-views.ts";
import { Switch } from "../../../ui/switch.tsx";
import { ValueSlider } from "../value-slider.tsx";

type Props = {
  shape: BrainShape;
  // Where "+ Add a layer" leads; it adds a layer in place when omitted.
  addLayerTo?: RouteId;
  onLayer: (id: string, neurons: number) => void;
  onRate: (value: number) => void;
  onRule: (id: string) => void;
  onAddLayer: () => void;
};

const addLayerClass =
  "flex h-8 items-start rounded-button border-[1.5px] border-dashed border-line-dashed px-0.5 text-ui hover:bg-fill-hover active:opacity-80";

// Layers and neurons as sliders, decisions per second, a hint about speed on this computer and the episode rules.
export function ShapeTab({ shape, addLayerTo, onLayer, onRate, onRule, onAddLayer }: Props) {
  const rate = shape.decisionsPerSecond;
  return (
    <div className="flex flex-col gap-3.5 px-3.5 py-3">
      <span className="leading-4 font-semibold">Shape of the brain</span>
      {shape.layers.map((layer, index) => (
        <SliderRow
          key={layer.id}
          label={`Layer ${index + 1} · neurons`}
          value={layer.neurons}
          ratio={layer.neurons / layer.max}
          onRatio={(ratio) => onLayer(layer.id, Math.max(8, Math.round((ratio * layer.max) / 8) * 8))}
        />
      ))}
      <SliderRow
        label="Decisions per second"
        value={rate.value}
        ratio={rate.value / rate.max}
        onRatio={(ratio) => onRate(Math.max(MIN_DECISIONS, Math.round(ratio * rate.max)))}
      />
      {addLayerTo ? (
        <GoTo to={addLayerTo} cta="+ Add a layer" className={addLayerClass}>
          + Add a layer
        </GoTo>
      ) : (
        <Act cta="+ Add a layer" onClick={onAddLayer} className={addLayerClass}>
          + Add a layer
        </Act>
      )}
      <p className="rounded-card-sm bg-control px-3 py-2.5 text-ui leading-normal text-fg-secondary">{shape.hint}</p>
      <span className="leading-4 font-semibold">Episode rules</span>
      {shape.rules.map((rule) => (
        <span key={rule.id} className="flex items-center gap-2.5 text-ui">
          <Switch
            label={rule.label}
            checked={rule.enabled}
            disabled={rule.lockedReason !== undefined}
            disabledReason={rule.lockedReason}
            onChange={() => onRule(rule.id)}
          />
          {rule.label}
        </span>
      ))}
    </div>
  );
}

function SliderRow({
  label,
  value,
  ratio,
  onRatio,
}: {
  label: string;
  value: number;
  ratio: number;
  onRatio: (ratio: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex text-ui leading-4">
        {label}
        <span className="ml-auto font-mono">{value}</span>
      </span>
      <ValueSlider label={label} ratio={ratio} valueText={String(value)} onRatio={onRatio} />
    </div>
  );
}
