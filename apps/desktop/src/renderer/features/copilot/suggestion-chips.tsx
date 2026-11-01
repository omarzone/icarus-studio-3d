import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Suggestion, SuggestionIntent } from "../../ports/copilot-port.ts";

export type SuggestionRoutes = Partial<Record<SuggestionIntent, RouteId>>;

type Props = {
  suggestions: readonly Suggestion[];
  routes: SuggestionRoutes;
  onSend: (text: string) => void;
};

const chipClass =
  "flex h-7 items-start rounded-full bg-control px-3 text-ui leading-4 text-fg-tool hover:bg-control-raised hover:text-fg";

// Clicking a chip sends that exact text; when the workspace maps its intent to a destination, it also goes there.
export function SuggestionChips({ suggestions, routes, onSend }: Props) {
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      {suggestions.map((suggestion) => {
        const to = routes[suggestion.intent];
        return to ? (
          <GoTo key={suggestion.text} to={to} cta={suggestion.text} className={chipClass}>
            {suggestion.text}
          </GoTo>
        ) : (
          <Act
            key={suggestion.text}
            cta={suggestion.text}
            onClick={() => onSend(suggestion.text)}
            className={chipClass}
          >
            {suggestion.text}
          </Act>
        );
      })}
    </div>
  );
}
