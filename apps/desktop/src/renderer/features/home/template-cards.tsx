import { Upload } from "lucide-react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { GoTo } from "../../app/navigation/go-to.tsx";
import type { TemplateKind, TemplateSummary, TemplatesPort } from "../../ports/templates-port.ts";
import { SceneThumbnail } from "../../scene/scene-thumbnail.tsx";
import { templateThumbnailKey } from "../../scene/thumbnail-cache.ts";

const OPENS: Record<TemplateKind, RouteId> = {
  "empty-world": "STA-WORLD-EMPTY-NOGUIDE",
  example: "SCR-WORLD",
  "motion-from-video": "MOD-MOTION-VIDEO",
  "brain-map": "MOD-BRAIN-SOURCE",
};

const cardClass =
  "flex flex-col overflow-hidden rounded-card bg-control text-left hover:bg-control-raised active:opacity-80";

type Props = { templates: readonly TemplateSummary[]; scene: TemplatesPort["templateScene"] };

export function TemplateCards({ templates, scene }: Props) {
  return (
    // One row: every template and the import card side by side.
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${templates.length + 1}, minmax(0, 1fr))` }}>
      {templates.map((template) => (
        <GoTo
          key={template.id}
          to={OPENS[template.kind]}
          params={{ template: template.id }}
          cta={`${template.name}\n${template.description}`}
          className={cardClass}
        >
          <SceneThumbnail
            cacheKey={templateThumbnailKey(template.id)}
            load={scene ? () => scene(template.id) : null}
            className="h-27.5 w-full"
          />
          <span className="flex flex-col gap-0.5 px-3 py-2.5" title={template.description}>
            <span className="leading-tight font-semibold">{template.name}</span>
            <span className="line-clamp-2 text-ui leading-tight text-fg-tertiary">{template.description}</span>
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
