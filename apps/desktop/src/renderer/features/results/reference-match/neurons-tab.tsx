// TAB-NEURONS
import type { NeuronLink } from "../../../ports/results-port.ts";

// Which neurons drive each behavior.
export function NeuronsTab({ links }: { links: readonly NeuronLink[] }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-2 text-ui">
      {links.map((link) => (
        <div key={link.behavior} className="grid grid-cols-[1.6fr_2fr] gap-2.5 rounded-button px-2.5 py-2">
          <span>{link.behavior}</span>
          <span className="text-fg-secondary">{link.neurons}</span>
        </div>
      ))}
    </div>
  );
}
