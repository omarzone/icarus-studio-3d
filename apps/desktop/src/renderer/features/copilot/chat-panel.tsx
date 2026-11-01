// PNL-CHAT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type Conversation, copilotPort } from "../../ports/copilot-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { useDockedPanel } from "../../ui/dock-slot.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { ChatTab } from "./chat-tab.tsx";
import { HistoryTab } from "./history-tab.tsx";
import type { ProposalRoutes } from "./proposal-card.tsx";
import type { SuggestionRoutes } from "./suggestion-chips.tsx";

export type ChatPanelProps = {
  // Copilot port key of this workspace's conversation ("park-pilot", "ideas"…).
  conversation: string;
  // Composer placeholder for the workspace ("Describe a change to the world…").
  placeholder: string;
  // Where suggestion chips lead in this workspace, by intent; unmapped chips send their text in place.
  suggestionRoutes?: SuggestionRoutes;
  // Where Apply, Discard and Edit by hand lead; unmapped actions stay in place.
  proposalRoutes?: ProposalRoutes;
  // Tabs after Chat in the tab bar; History (→ MOD-HISTORY) by default.
  tabs?: ReactNode;
  className?: string;
};

export const copilotKey = (conversation: string) => ["copilot", conversation] as const;

export function ChatPanel({
  conversation,
  placeholder,
  suggestionRoutes = {},
  proposalRoutes,
  tabs = <HistoryTab />,
  className = "flex-1",
}: ChatPanelProps) {
  const port = usePort(copilotPort);
  const client = useQueryClient();
  const key = copilotKey(conversation);
  const query = useQuery({ queryKey: key, queryFn: () => port.getConversation(conversation) });
  // Settling a proposal can also change other conversations of the project, so they refetch.
  const update = {
    onSuccess: (next: Conversation) => {
      client.setQueryData(key, next);
      void client.invalidateQueries({
        queryKey: ["copilot"],
        predicate: (cached) => cached.queryKey[1] !== conversation,
      });
    },
  };
  const send = useEngineAction(port.sendMessage);
  const apply = useEngineAction(port.applyProposal);
  const discard = useEngineAction(port.discardProposal);
  const autonomy = useEngineAction(port.setAutonomy);
  const attach = useEngineAction(port.attachFile);
  const docked = useDockedPanel();
  return (
    <Panel
      id="PNL-CHAT"
      className={className}
      tabs={
        <>
          <PanelTab label="Chat" active />
          {tabs}
        </>
      }
      options={
        // Docked, the dock's ⋯ menu stands in for the panel's own.
        docked ? undefined : (
          <Act cta="Chat options" aria-label="Chat options" className={buttonClass("icon", "size-6!")}>
            <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
          </Act>
        )
      }
    >
      <QueryView query={query}>
        {(data) => (
          <ChatTab
            conversation={data}
            placeholder={placeholder}
            suggestionRoutes={suggestionRoutes}
            proposalRoutes={proposalRoutes}
            onSend={(text) => send.mutate({ key: conversation, text }, update)}
            onApply={(id) => apply.mutate({ key: conversation, id }, update)}
            onDiscard={(id) => discard.mutate({ key: conversation, id }, update)}
            onAttach={() => attach.mutate({ key: conversation })}
            onAutonomy={(mode) => autonomy.mutate({ key: conversation, mode }, update)}
          />
        )}
      </QueryView>
    </Panel>
  );
}
