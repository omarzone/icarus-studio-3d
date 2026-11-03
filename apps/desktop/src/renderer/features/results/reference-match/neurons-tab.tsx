// TAB-NEURONS
import type { NeuronLayer } from "../../../ports/results-port.ts";

// What the brain's neurons did, layer by layer, with the most active ones first.
export function NeuronsTab({ layers }: { layers: readonly NeuronLayer[] }) {
  return (
    <div className="flex flex-col gap-3 px-2.5 py-2 text-ui">
      {layers.map((layer) => (
        <section key={layer.layer} className="flex flex-col gap-1 px-2.5">
          <span className="font-semibold">{layer.layer}</span>
          <span className="text-meta text-fg-tertiary">{layer.detail}</span>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-x-2.5 gap-y-1 pt-1">
            {layer.neurons.map((neuron) => (
              <div key={neuron.id} className="contents">
                <span className="truncate text-fg-secondary">{neuron.label}</span>
                <span className="h-1 rounded-bar bg-fill-track-off" role="img" aria-label={`${neuron.label}`}>
                  <span
                    className="block h-1 rounded-bar bg-fg"
                    style={{ width: `${Math.round(neuron.activity * 100)}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
