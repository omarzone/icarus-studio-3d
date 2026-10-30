import type { ReactNode } from "react";
import type { RouteId } from "../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../app/navigation/go-to.tsx";

type Props = {
  title: string;
  detail: string;
  checked: boolean;
  onSelect?: () => void;
  // Leads to another surface instead of choosing in place (an option that needs an import first).
  to?: RouteId;
  // Extra content under the detail of a chosen option (a dataset card).
  children?: ReactNode;
};

const base = "flex w-full items-start gap-3 rounded-[14px] bg-control px-3.5 py-3 text-left active:opacity-80";

// One option of a radio group drawn as a card: radio, title and a plain explanation; the chosen one is outlined.
export function ChoiceCard({ title, detail, checked, onSelect, to, children }: Props) {
  const className = `${base} ${checked ? "shadow-[inset_0_0_0_1.5px_var(--ic-fg)]" : "hover:bg-control-raised"}`;
  const cta = to ? `${title}\n${detail}` : title;
  const content = (
    <>
      <span
        aria-hidden
        className={`mt-px grid size-4 shrink-0 place-items-center rounded-full border-2 ${checked ? "border-fg" : "border-fg-disabled"}`}
      >
        {checked ? <span className="size-2 rounded-full bg-fg" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className="leading-4 font-semibold">{title}</span>
        <span className="text-ui leading-normal text-fg-secondary">{detail}</span>
        {children}
      </span>
    </>
  );
  return to ? (
    <GoTo to={to} cta={cta} role="radio" aria-checked={checked} className={className}>
      {content}
    </GoTo>
  ) : (
    <Act cta={title} role="radio" aria-checked={checked} onClick={onSelect} className={className}>
      {content}
    </Act>
  );
}
