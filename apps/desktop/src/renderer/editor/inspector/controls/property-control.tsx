import { ChevronRight, Lock, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import { formatNumber, formatPropertyValue, formatTime } from "../../../ports/property-format.ts";
import type { ListOption, Property, PropertyPanel, PropertyValue, Swatch } from "../../../ports/scene-port.ts";
import { NOT_YET_CLASS, useNotYet } from "../../../ui/not-yet.ts";
import { Select } from "../../../ui/select.tsx";
import { SCENE_ICONS } from "../../scene-icons.ts";
import { RangeTrack, SliderTrack } from "./slider-track.tsx";
import { SwitchToggle } from "./switch-toggle.tsx";
import { type ControlTone, fieldBox, fieldClass, parseNumber, toneText, ValueField } from "./value-field.tsx";

export type PanelRoutes = Partial<Record<PropertyPanel, RouteId>>;

type Props = {
  property: Property;
  onChange: (value: PropertyValue) => void;
  // Where "Opens a panel" values lead in this workspace; without a route they act in place.
  panelRoutes?: PanelRoutes;
};

const ratioOf = (value: number, min: number, max: number) => (max === min ? 0 : (value - min) / (max - min));
const valueAt = (ratio: number, min: number, max: number, step: number) =>
  Math.round((min + ratio * (max - min)) / step) * step;

function toneOf(property: Property): ControlTone {
  if (property.state === "out-of-range") {
    return "danger";
  }
  return property.state === "proposed" ? "proposed" : "default";
}

// The one control of each of the 12 property types.
export function PropertyControl({ property, onChange, panelRoutes }: Props) {
  if (property.state === "locked") {
    return <ReadOnly text={formatPropertyValue(property)} locked />;
  }
  if (property.state === "mixed") {
    return (
      <ValueField
        label={property.label}
        value=""
        mono={false}
        placeholder={`Mixed · ${property.note ?? ""}`}
        onCommit={() => true}
        className={`${fieldBox} w-full`}
      />
    );
  }
  const shown: PropertyValue = property.state === "proposed" && property.proposed ? property.proposed : property;
  return (
    <ValueControl
      label={property.label}
      value={shown}
      tone={toneOf(property)}
      onChange={onChange}
      panelRoutes={panelRoutes}
    />
  );
}

type ValueProps = {
  label: string;
  value: PropertyValue;
  tone: ControlTone;
  onChange: (value: PropertyValue) => void;
  panelRoutes?: PanelRoutes;
};

function ValueControl({ label, value, tone, onChange, panelRoutes }: ValueProps) {
  const notYet = useNotYet();
  switch (value.type) {
    case "number":
      return (
        <span className="flex gap-1">
          <ValueField
            label={label}
            tone={tone}
            value={formatPropertyValue(value)}
            onCommit={(text) => commitNumber(text, (next) => onChange({ ...value, value: next, auto: false }))}
            className={`${fieldBox} flex-1`}
          />
          {value.auto ? (
            <Act
              cta={`${label} auto`}
              title="Computed from the shape"
              className="flex h-6.5 items-center rounded-control bg-fill-ghost px-1.75 text-meta text-fg-secondary hover:text-fg"
            >
              auto
            </Act>
          ) : null}
        </span>
      );
    case "slider": {
      const text =
        value.format === "time" ? formatTime(value.value) : formatNumber(value.value, value.step, value.unit);
      return (
        <span className="flex items-center gap-2">
          <SliderTrack
            label={label}
            tone={tone}
            ratio={ratioOf(value.value, value.min, value.max)}
            valueText={text}
            step={value.step / (value.max - value.min)}
            onChange={(ratio) => onChange({ ...value, value: valueAt(ratio, value.min, value.max, value.step) })}
          />
          <ValueField
            label={`${label} value`}
            tone={tone}
            value={text}
            onCommit={(next) => commitNumber(next, (number) => onChange({ ...value, value: number }))}
            className="h-6 min-w-11.5 shrink-0 rounded-control bg-control px-1.5 text-center text-meta field-sizing-content hover:bg-control-raised focus:bg-control-raised"
          />
        </span>
      );
    }
    case "range": {
      const step = 1 / 100;
      const at = (ratio: number) => Math.round(value.min + ratio * (value.max - value.min));
      return (
        <RangeTrack
          label={label}
          tone={tone}
          step={step}
          low={ratioOf(value.low, value.min, value.max)}
          high={ratioOf(value.high, value.min, value.max)}
          lowText={withUnit(value.low, value.unit)}
          highText={withUnit(value.high, value.unit)}
          onChange={(low, high) => onChange({ ...value, low: at(low), high: at(high) })}
        />
      );
    }
    case "choice":
      return (
        <span role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-control bg-control p-0.5">
          {value.options.map((option) => {
            const active = option === value.value;
            return (
              <Act
                key={option}
                cta={`${label} ${option}`}
                role="radio"
                aria-checked={active}
                aria-current={active ? "true" : undefined}
                onClick={() => onChange({ ...value, value: option })}
                className={`flex-1 rounded-control py-1 text-meta ${
                  active
                    ? "bg-selected font-semibold text-on-selected"
                    : "text-fg-secondary hover:bg-fill-hover hover:text-fg"
                }`}
              >
                {option}
              </Act>
            );
          })}
        </span>
      );
    case "list":
      return (
        <ListControl
          label={label}
          value={value.value}
          options={value.options}
          tone={tone}
          onPick={(next) => onChange({ ...value, value: next })}
        />
      );
    case "switch":
      return (
        <span className="flex justify-end">
          <SwitchToggle label={label} on={value.value} onToggle={() => onChange({ ...value, value: !value.value })} />
        </span>
      );
    case "color":
      return (
        <span className={`${fieldClass} flex items-center gap-1.5 px-2`}>
          <SwatchMark swatch={{ kind: "color", value: value.value }} large />
          <ValueField
            label={label}
            tone={tone}
            value={value.value}
            onCommit={(text) => {
              const valid = /^#[0-9a-f]{6}$/i.test(text.trim());
              if (valid) {
                onChange({ ...value, value: text.trim().toUpperCase() });
              }
              return valid;
            }}
            className="h-6 w-full bg-transparent text-meta"
          />
        </span>
      );
    case "vector":
      return (
        <span className="grid grid-cols-3 gap-0.75">
          {(["X", "Y", "Z"] as const).map((axis, index) => (
            <span key={axis} className={`${fieldClass} flex items-center gap-0.75 px-1.25 font-mono text-micro`}>
              <b className={`font-bold ${AXIS[axis]}`}>{axis}</b>
              <ValueField
                label={`${label} ${axis}`}
                tone={tone}
                value={`${value.value[index] ?? 0}${value.unit ?? ""}`}
                onCommit={(text) =>
                  commitNumber(text, (number) => {
                    const next: [number, number, number] = [...value.value];
                    next[index] = number;
                    onChange({ ...value, value: next });
                  })
                }
                className="h-6 w-full bg-transparent text-micro"
              />
            </span>
          ))}
        </span>
      );
    case "count":
      return (
        <span className="flex items-center gap-1">
          <StepButton
            label={`Fewer ${label}`}
            onClick={() => onChange({ ...value, value: Math.max(value.min, value.value - 1) })}
          >
            <Minus size={12} strokeWidth={1.75} aria-hidden />
          </StepButton>
          <ValueField
            label={label}
            tone={tone}
            value={String(value.value)}
            onCommit={(text) =>
              commitNumber(text, (number) =>
                onChange({ ...value, value: Math.min(value.max, Math.max(value.min, Math.round(number))) }),
              )
            }
            className={`${fieldBox} flex-1 text-center`}
          />
          <StepButton
            label={`More ${label}`}
            onClick={() => onChange({ ...value, value: Math.min(value.max, value.value + 1) })}
          >
            <Plus size={12} strokeWidth={1.75} aria-hidden />
          </StepButton>
        </span>
      );
    case "asset": {
      const Icon = value.icon ? SCENE_ICONS[value.icon] : null;
      return (
        <span className={`${fieldClass} flex items-center gap-1.5 px-2 hover:bg-control`}>
          <span className="grid size-4.5 shrink-0 place-items-center rounded-[5px] bg-control-raised">
            {Icon ? <Icon size={12} strokeWidth={1.75} aria-hidden /> : null}
          </span>
          <span className={`min-w-0 flex-1 truncate ${toneText[tone]}`}>{value.value}</span>
          <Act
            cta={`Change ${label}`}
            className={`rounded-control px-1 text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg ${NOT_YET_CLASS}`}
            {...notYet?.(`Change ${label}`, "Pick another file or library asset")}
          >
            Change
          </Act>
        </span>
      );
    }
    case "panel":
      return <PanelLink label={value.value} to={panelRoutes?.[value.panel]} tone={tone} />;
    case "readonly":
      return <ReadOnly text={value.value} locked={false} />;
  }
}

const withUnit = (value: number, unit: string | undefined) =>
  unit === "°" ? `${value}°` : unit ? `${value} ${unit}` : String(value);

const AXIS = { X: "text-danger-graphic", Y: "text-ok", Z: "text-proposal" } as const;

function commitNumber(text: string, apply: (value: number) => void): boolean {
  const number = parseNumber(text);
  if (number === null) {
    return false;
  }
  apply(number);
  return true;
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Act
      cta={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-control bg-control-raised text-fg-secondary hover:text-fg"
    >
      {children}
    </Act>
  );
}

export function SwatchMark({ swatch, large = false }: { swatch: Swatch; large?: boolean }) {
  const background = swatch.kind === "color" ? swatch.value : `linear-gradient(180deg, ${swatch.from}, ${swatch.to})`;
  return (
    <span
      aria-hidden
      style={{ background }}
      className={`shrink-0 shadow-[inset_0_0_0_1px_var(--ic-line-strong)] ${large ? "size-4 rounded-[5px]" : "size-3.5 rounded-[4px]"}`}
    />
  );
}

function ListControl({
  label,
  value,
  options,
  tone,
  onPick,
}: {
  label: string;
  value: string;
  options: readonly ListOption[];
  tone: ControlTone;
  onPick: (value: string) => void;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onPick}
      options={options.map((option) => {
        const Icon = option.icon ? SCENE_ICONS[option.icon] : null;
        return {
          value: option.value,
          label: option.label,
          leading: Icon ? (
            <Icon size={13} strokeWidth={1.75} className="shrink-0" aria-hidden />
          ) : option.swatch ? (
            <SwatchMark swatch={option.swatch} />
          ) : undefined,
        };
      })}
      className={`${fieldClass} w-full px-2 text-meta ${toneText[tone]}`}
    />
  );
}

function PanelLink({ label, to, tone }: { label: string; to: RouteId | undefined; tone: ControlTone }) {
  const className = `${fieldClass} flex w-full items-center gap-1.5 px-2 text-left ${toneText[tone]}`;
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight size={12} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
    </>
  );
  return to ? (
    <GoTo to={to} cta={label} className={className}>
      {content}
    </GoTo>
  ) : (
    <Act cta={label} className={className}>
      {content}
    </Act>
  );
}

function ReadOnly({ text, locked }: { text: string; locked: boolean }) {
  return (
    <span
      title={locked ? "Locked while a run uses it" : "Measured, not editable"}
      className="flex h-6.5 items-center justify-end gap-1.25 text-meta text-fg-secondary"
    >
      <Lock size={11} strokeWidth={1.75} aria-hidden />
      {text}
    </span>
  );
}
