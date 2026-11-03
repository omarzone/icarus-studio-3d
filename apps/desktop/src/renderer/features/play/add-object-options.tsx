// PNL-VIEWPORT · Play: what Add object brings and how
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { ColorPicker } from "../../editor/inspector/controls/color-picker.tsx";
import { SliderTrack } from "../../editor/inspector/controls/slider-track.tsx";
import type { DropPlacement, PlayDrop, PlayPiece } from "../../ports/play-port.ts";
import { Segmented } from "../../ui/segmented.tsx";
import { Select } from "../../ui/select.tsx";
import { choosePiece, type DropRange, isMovable, pieceOf, ratioOf, typedWeight, valueAt } from "./drop-choice.ts";

const PLACEMENTS: readonly { id: DropPlacement; label: string }[] = [
  { id: "place", label: "Place" },
  { id: "drop", label: "Drop" },
  { id: "throw", label: "Throw" },
];

type Props = { drop: PlayDrop; pieces: readonly PlayPiece[]; onChange: (drop: PlayDrop) => void };

// Floating over the Play view while Add object is picked; nothing here changes the project.
export function AddObjectOptions({ drop, pieces, onChange }: Props) {
  const piece = pieceOf(drop, pieces);
  const movable = isMovable(piece);
  const set = (change: Partial<PlayDrop>) => onChange({ ...drop, ...change });
  // Remounts the weight field when the piece's own values come back, so its typed text clears too.
  const [round, setRound] = useState(0);
  return (
    <section
      aria-label="Add object options"
      className="absolute top-17 right-3 flex w-66 flex-col gap-2.5 rounded-card-sm bg-overlay p-3 text-ui"
    >
      <Select
        label="Piece"
        value={drop.piece}
        options={pieces.map((item) => ({ value: item.id, label: item.label }))}
        onChange={(id) => {
          const next = pieces.find((item) => item.id === id);
          if (next) {
            onChange(choosePiece(drop, next));
          }
        }}
        className="h-7.5 w-full rounded-control bg-control px-2.5 text-ui"
      />
      {movable ? (
        <Segmented
          items={PLACEMENTS.map((item) => ({
            label: item.label,
            active: drop.placement === item.id,
            onSelect: () => set({ placement: item.id }),
          }))}
        />
      ) : (
        <p className="text-meta text-fg-tertiary">Fixed in place: it can only be placed.</p>
      )}
      {drop.placement !== "place" ? (
        <Slider label="Height" range="height" value={drop.height} unit="m" onValue={(height) => set({ height })} />
      ) : null}
      {drop.placement === "throw" ? (
        <Slider label="Speed" range="speed" value={drop.speed} unit="m/s" onValue={(speed) => set({ speed })} />
      ) : null}
      <Slider label="Size" range="scale" value={drop.scale} unit="×" onValue={(scale) => set({ scale })} />
      {movable && piece ? (
        <WeightField key={`${drop.piece}:${round}`} drop={drop} piece={piece} onWeight={(weight) => set({ weight })} />
      ) : null}
      <Slider
        label="Friction"
        range="friction"
        value={drop.friction ?? piece?.friction ?? 0.8}
        onValue={(friction) => set({ friction })}
      />
      <Slider
        label="Bounciness"
        range="bounciness"
        value={drop.bounciness ?? piece?.bounciness ?? 0}
        onValue={(bounciness) => set({ bounciness })}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-secondary">Color</span>
        <ColorPicker
          label="Object color"
          value={drop.color ?? piece?.color ?? "#8a8f98"}
          tone="default"
          onCommit={(color) => set({ color })}
        />
      </div>
      <Slider label="Copies" range="count" value={drop.count} digits={0} onValue={(count) => set({ count })} />
      {drop.count > 1 ? (
        <>
          <Slider
            label="Every"
            range="interval"
            value={drop.interval}
            unit="s"
            onValue={(interval) => set({ interval })}
          />
          <Slider label="Spread" range="spread" value={drop.spread} unit="m" onValue={(spread) => set({ spread })} />
        </>
      ) : null}
      <Act
        cta="Use the piece's own values"
        onClick={() => {
          if (piece) {
            onChange({ ...choosePiece(drop, piece), scale: 1, count: 1 });
            setRound((count) => count + 1);
          }
        }}
        className="self-start rounded-control px-1.5 py-0.5 text-meta text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        Use the piece's own values
      </Act>
    </section>
  );
}

type SliderProps = {
  label: string;
  range: DropRange;
  value: number;
  unit?: string;
  digits?: number;
  onValue: (value: number) => void;
};

function Slider({ label, range, value, unit, digits = 2, onValue }: SliderProps) {
  const text = unit ? `${Number(value.toFixed(digits))} ${unit}` : String(Number(value.toFixed(digits)));
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_56px] items-center gap-2">
      <span className="text-fg-secondary">{label}</span>
      <SliderTrack
        label={label}
        ratio={ratioOf(range, value)}
        tone="default"
        valueText={text}
        step={0.05}
        onChange={(ratio) => onValue(valueAt(range, ratio, digits))}
      />
      <span className="text-right font-mono text-meta tabular-nums">{text}</span>
    </div>
  );
}

type WeightProps = { drop: PlayDrop; piece: PlayPiece; onWeight: (weight: PlayDrop["weight"]) => void };

function WeightField({ drop, piece, onWeight }: WeightProps) {
  const [kind, setKind] = useState<"mass" | "density">(drop.weight?.kind ?? "mass");
  const [text, setText] = useState(drop.weight ? String(drop.weight.value) : "");
  const invalid = text.trim() !== "" && typedWeight(kind, text) === null;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
        <span className="text-fg-secondary">Weight</span>
        <input
          type="text"
          inputMode="decimal"
          data-cta="object-weight"
          aria-label={kind === "mass" ? "Mass in kilograms" : "Density in kilograms per cubic metre"}
          aria-invalid={invalid}
          placeholder={kind === "mass" ? `${piece.mass ?? 1} kg` : "auto"}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onWeight(typedWeight(kind, event.target.value));
          }}
          className="h-7 min-w-0 rounded-control bg-control px-2 font-mono text-ui outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised"
        />
        <Segmented
          items={(["mass", "density"] as const).map((item) => ({
            label: item === "mass" ? "kg" : "kg/m³",
            active: kind === item,
            onSelect: () => {
              setKind(item);
              onWeight(typedWeight(item, text));
            },
          }))}
        />
      </div>
      {invalid ? (
        <p role="alert" className="text-meta text-warn">
          {kind === "mass" ? "Use 0.01 to 10,000 kg" : "Use 10 to 20,000 kg/m³"}; empty keeps its own
        </p>
      ) : null}
    </div>
  );
}
