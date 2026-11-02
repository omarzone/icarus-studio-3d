// TAB-CHAT
import type { AutonomyMode, ChatMessage, Conversation } from "../../ports/copilot-port.ts";
import { CopilotNotConnectedState } from "../../ui/copilot-not-connected.tsx";
import { BuildProgressCard } from "./build-progress-card.tsx";
import { ChatActions } from "./chat-actions.tsx";
import { CopilotBubble, ThinkingBubble, UserBubble } from "./chat-messages.tsx";
import { Composer } from "./composer.tsx";
import { PlanCard } from "./plan-card.tsx";
import { ProposalCard, type ProposalRoutes } from "./proposal-card.tsx";
import { MilestoneDivider, RunProgressCard } from "./run-progress-card.tsx";
import { SuggestionChips, type SuggestionRoutes } from "./suggestion-chips.tsx";

export type ChatTabProps = {
  conversation: Conversation;
  placeholder: string;
  suggestionRoutes: SuggestionRoutes;
  proposalRoutes?: ProposalRoutes;
  // Text of the message on its way to the copilot, shown until the answer arrives.
  sending?: string | null;
  // Why the copilot could not answer the last message because no model is connected.
  notConnected?: string | null;
  // Resolves true once the copilot has the message.
  onSend: (text: string) => Promise<boolean>;
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
      {props.notConnected ? (
        <div className="min-h-0 flex-1">
          <CopilotNotConnectedState detail={props.notConnected} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pt-2 [mask-image:linear-gradient(to_bottom,transparent_0,black_56px)]">
          <div className="mt-auto flex flex-col gap-3.5">
            {conversation.messages.map((message) => (
              <Message key={message.id} message={message} {...props} />
            ))}
            {props.sending ? (
              <>
                <UserBubble text={props.sending} />
                <ThinkingBubble />
              </>
            ) : null}
          </div>
        </div>
      )}
      <SuggestionChips suggestions={conversation.suggestions} routes={props.suggestionRoutes} onSend={props.onSend} />
      <Composer
        placeholder={props.placeholder}
        autonomy={conversation.autonomy}
        autonomyNote={conversation.autonomyNote}
        sending={Boolean(props.sending)}
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
  onApply,
  onDiscard,
  onSend,
}: ChatTabProps & { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return <UserBubble text={message.text} />;
    case "copilot":
      return (
        <CopilotBubble
          title={message.title}
          text={message.text}
          thinking={message.thinking}
          checks={message.checks}
          actions={
            message.actions ? (
              <ChatActions actions={message.actions} routes={suggestionRoutes} onSend={onSend} />
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
    case "milestone":
      return <MilestoneDivider text={message.text} />;
    case "progress":
      return <RunProgressCard progress={message.progress} />;
    case "plan":
      return <PlanCard plan={message.plan} routes={suggestionRoutes} onSend={onSend} />;
  }
}
