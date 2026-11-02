import { isOverlay } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useCopilotOutbox } from "../../app/runtime/copilot-outbox.ts";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import type { Suggestion } from "../../ports/copilot-port.ts";
import { useConversationKey } from "./conversation-key.ts";
import { useKnownRoute } from "./known-routes.ts";
import { chipPlan, type SuggestionRoutes } from "./suggestion-routes.ts";

export type { SuggestionRoutes };

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
  const app = useRuntimeMode() === "app";
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      {suggestions.map((suggestion) =>
        app ? (
          <AppChip key={suggestion.text} suggestion={suggestion} routes={routes} onSend={onSend} />
        ) : (
          <SampleChip key={suggestion.text} suggestion={suggestion} routes={routes} onSend={onSend} />
        ),
      )}
    </div>
  );
}

type ChipProps = { suggestion: Suggestion; routes: SuggestionRoutes; onSend: (text: string) => void };

function SampleChip({ suggestion, routes, onSend }: ChipProps) {
  const to = routes[suggestion.intent];
  return to ? (
    <GoTo to={to} cta={suggestion.text} className={chipClass}>
      {suggestion.text}
    </GoTo>
  ) : (
    <Act cta={suggestion.text} onClick={() => onSend(suggestion.text)} className={chipClass}>
      {suggestion.text}
    </Act>
  );
}

// In the app a chip leads to the screen its intent names and, where a question fits, asks it there: the chat of the
// screen it opens takes the message from the outbox.
function AppChip({ suggestion, routes, onSend }: ChipProps) {
  const plan = chipPlan(suggestion, routes, useKnownRoute());
  const go = useNavigation((state) => state.go);
  const ask = useCopilotOutbox((state) => state.ask);
  const conversation = useConversationKey("");
  const press = () => {
    if (plan.go === null) {
      if (plan.send !== null) {
        onSend(plan.send);
      }
      return;
    }
    go(plan.go);
    if (plan.send !== null && conversation !== null) {
      if (isOverlay(plan.go)) {
        onSend(plan.send);
      } else {
        ask(conversation, plan.send);
      }
    }
  };
  return (
    <Act cta={suggestion.text} data-goes-to={plan.go ?? undefined} onClick={press} className={chipClass}>
      {suggestion.text}
    </Act>
  );
}
