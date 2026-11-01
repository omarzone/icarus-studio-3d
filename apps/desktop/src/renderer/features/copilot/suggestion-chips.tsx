import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Suggestion, SuggestionIntent } from "../../ports/copilot-port.ts";

export type SuggestionRoutes = Partial<Record<SuggestionIntent, RouteId>>;

type Props = {
  suggestions: readonly Suggestion[];
  routes: SuggestionRoutes;
  onSend: (text: string) => void;
};

// One line keeps the 28 px chip; a long question wraps inside it instead of spilling out.
const chipClass =
  "flex min-h-7 max-w-full items-center rounded-full bg-control px-3 py-1.5 text-left text-ui leading-4 wrap-break-word text-fg-tool hover:bg-control-raised hover:text-fg active:opacity-80";

// Clicking a chip sends that exact text; when the workspace maps its intent to a destination, it also goes there.
// Which suggestions show (only the latest answer's, none while sending) is decided by `visibleSuggestions`.
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
