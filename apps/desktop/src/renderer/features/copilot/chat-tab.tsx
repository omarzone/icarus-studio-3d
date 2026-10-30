// TAB-CHAT
import type { AutonomyMode, ChatMessage, Conversation } from "../../ports/copilot-port.ts";
import { BuildProgressCard } from "./build-progress-card.tsx";
import { CopilotBubble, UserBubble } from "./chat-messages.tsx";
import { Composer } from "./composer.tsx";
import { InlineActions } from "./inline-actions.tsx";
import { ProposalCard, type ProposalRoutes } from "./proposal-card.tsx";
import { SuggestionChips, type SuggestionRoutes } from "./suggestion-chips.tsx";

export type ChatTabProps = {
  conversation: Conversation;
  placeholder: string;
  suggestionRoutes: SuggestionRoutes;
  proposalRoutes?: ProposalRoutes;
  onSend: (text: string) => void;
  onApply: (id: string) => void;
  onDiscard: (id: string) => void;
  onAttach: () => void;
  onAutonomy: (mode: AutonomyMode) => void;
};

// The conversation sticks to the bottom under a fade, then suggestion chips and the composer.
export function ChatTab(props: ChatTabProps) {
  const { conversation } = props;
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pt-2 [mask-image:linear-gradient(to_bottom,transparent_0,black_56px)]">
        <div className="mt-auto flex flex-col gap-3.5">
          {conversation.messages.map((message) => (
            <Message key={message.id} message={message} {...props} />
          ))}
        </div>
      </div>
      <SuggestionChips suggestions={conversation.suggestions} routes={props.suggestionRoutes} onSend={props.onSend} />
      <Composer
        placeholder={props.placeholder}
        autonomy={conversation.autonomy}
        onSend={props.onSend}
        onAttach={props.onAttach}
        onAutonomy={props.onAutonomy}
      />
    </div>
  );
}

function Message({
  message,
  proposalRoutes,
  suggestionRoutes,
  onSend,
  onApply,
  onDiscard,
}: ChatTabProps & { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return <UserBubble text={message.text} />;
    case "copilot":
      return (
        <CopilotBubble
          title={message.title}
          text={message.text}
          checks={message.checks}
          actions={
            message.actions ? (
              <InlineActions actions={message.actions} routes={suggestionRoutes} onSend={onSend} />
            ) : undefined
          }
        />
      );
    case "proposal":
      return (
        <ProposalCard
          proposal={message.proposal}
          routes={proposalRoutes}
          onApply={() => onApply(message.proposal.id)}
          onDiscard={() => onDiscard(message.proposal.id)}
        />
      );
    case "build":
      return <BuildProgressCard scene={message.scene} />;
  }
}
