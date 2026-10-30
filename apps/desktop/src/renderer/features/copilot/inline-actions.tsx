import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Suggestion } from "../../ports/copilot-port.ts";
import type { SuggestionRoutes } from "./suggestion-chips.tsx";

type Props = {
  actions: readonly Suggestion[];
  routes: SuggestionRoutes;
  onSend: (text: string) => void;
};

const primary =
  "inline-flex h-7.5 items-center rounded-full bg-selected px-3.5 text-ui font-semibold text-on-selected hover:opacity-90 active:opacity-80";
const ghost =
  "inline-flex h-7.5 items-center rounded-full bg-fill-ghost px-3.5 text-ui text-fg hover:bg-control-raised active:opacity-80";

// Buttons under a copilot answer ("Train the spin", "Show me"); they route like suggestion chips, else send their text.
export function InlineActions({ actions, routes, onSend }: Props) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action, index) => {
        const to = routes[action.intent];
        const className = index === 0 ? primary : ghost;
        return to ? (
          <GoTo key={action.text} to={to} cta={action.text} className={className}>
            {action.text}
          </GoTo>
        ) : (
          <Act key={action.text} cta={action.text} onClick={() => onSend(action.text)} className={className}>
            {action.text}
          </Act>
        );
      })}
    </div>
  );
}
