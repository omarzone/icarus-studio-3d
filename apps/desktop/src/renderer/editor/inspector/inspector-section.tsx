import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { InspectorSection as Section } from "../../ports/scene-port.ts";
import { SCENE_ICONS } from "../scene-icons.ts";

type Props = {
  section: Section;
  // Component sections show their icon, note and actions; settings groups only a title.
  component: boolean;
  children: ReactNode;
};

// A collapsible component or settings group of the inspector.
export function InspectorSection({ section, component, children }: Props) {
  const [open, setOpen] = useState(!section.collapsed);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = section.icon ? SCENE_ICONS[section.icon] : null;
  return (
    <section aria-label={section.title} className={component ? "border-t border-line-subtle" : ""}>
      <div className={`flex items-center gap-2 px-3 ${component ? "py-1.5" : "pt-2 pb-1"}`}>
        <Act
          cta={section.title}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-ui font-semibold hover:bg-fill-hover ${component ? "py-0.5" : ""}`}
        >
          <Chevron size={12} strokeWidth={1.75} className="shrink-0 text-fg-secondary" aria-hidden />
          {Icon ? <Icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden /> : null}
          <span className="truncate">{section.title}</span>
          {section.note ? <span className="ml-auto font-normal text-fg-tertiary">{section.note}</span> : null}
        </Act>
        {component ? (
          <Act
            cta={`${section.title} actions`}
            aria-label={`${section.title} actions`}
            className="grid size-5 place-items-center rounded-control text-fg-tertiary hover:bg-fill-hover hover:text-fg"
          >
            <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
          </Act>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  );
}
