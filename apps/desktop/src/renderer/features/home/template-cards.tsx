import { Upload } from "lucide-react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { GoTo } from "../../app/navigation/go-to.tsx";
import type { TemplateKind, TemplateSummary } from "../../ports/templates-port.ts";

const OPENS: Record<TemplateKind, RouteId> = {
  "empty-world": "STA-WORLD-EMPTY-NOGUIDE",
  example: "SCR-WORLD",
  "motion-from-video": "MOD-MOTION-VIDEO",
  "brain-map": "MOD-BRAIN-SOURCE",
};

const cardClass =
  "flex flex-col overflow-hidden rounded-card bg-control text-left hover:bg-control-raised active:opacity-80";

export function TemplateCards({ templates }: { templates: readonly TemplateSummary[] }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {templates.map((template) => (
        <GoTo
          key={template.id}
          to={OPENS[template.kind]}
          params={{ template: template.id }}
          cta={`${template.name}\n${template.description}`}
          className={cardClass}
        >
          <span aria-hidden className="h-27.5 w-full bg-control-raised" />
          <span className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="leading-tight font-semibold">{template.name}</span>
            <span className="text-ui leading-tight text-fg-tertiary">{template.description}</span>
          </span>
        </GoTo>
      ))}
      <ImportCard />
    </div>
  );
}

export function ImportCard() {
  return (
    <GoTo
      to="MOD-IMPORT"
      cta={"Import your own\nModel, robot or environment"}
      className="flex flex-col items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-line-dashed p-2.5 text-center hover:bg-fill-hover active:opacity-80"
    >
      <Upload size={22} strokeWidth={1.75} aria-hidden />
      <span className="leading-tight font-semibold">Import your own</span>
      <span className="text-ui leading-tight text-fg-tertiary">Model, robot or environment</span>
    </GoTo>
  );
}
