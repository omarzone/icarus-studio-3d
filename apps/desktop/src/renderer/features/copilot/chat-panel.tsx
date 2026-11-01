// PNL-CHAT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { sceneKeys } from "../../editor/scene-queries.ts";
import { type Conversation, copilotPort } from "../../ports/copilot-port.ts";
import { workspaceOf } from "../../ports/copilot-views.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { useDockedPanel } from "../../ui/dock-slot.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { ChatTab } from "./chat-tab.tsx";
import { copilotKey, previewKey, useConversationKey } from "./conversation-key.ts";
import { HistoryTab } from "./history-tab.tsx";
import type { ProposalRoutes } from "./proposal-card.tsx";
import type { SuggestionRoutes } from "./suggestion-chips.tsx";

export type ChatPanelProps = {
  // Sample conversation of this workspace in the prototype ("park-pilot", "ideas"…); the app uses the open project's.
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

export { copilotKey };

export function ChatPanel({
  conversation: sample,
  placeholder,
  suggestionRoutes = {},
  proposalRoutes,
  tabs = <HistoryTab />,
  className = "flex-1",
}: ChatPanelProps) {
  const conversation = useConversationKey(sample);
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
      {conversation === null ? (
        <EmptyState
          title="No project open yet"
          body="The copilot works on a project. Pick an idea or open a project to talk to it."
        />
      ) : (
        <ProjectChat
          conversation={conversation}
          placeholder={placeholder}
          suggestionRoutes={suggestionRoutes}
          proposalRoutes={proposalRoutes}
        />
      )}
    </Panel>
  );
}

type ProjectChatProps = Required<Pick<ChatPanelProps, "conversation" | "placeholder" | "suggestionRoutes">> &
  Pick<ChatPanelProps, "proposalRoutes">;

function ProjectChat({ conversation, placeholder, suggestionRoutes, proposalRoutes }: ProjectChatProps) {
  const port = usePort(copilotPort);
  const client = useQueryClient();
  const screen = useNavigation((state) => state.screen);
  const key = copilotKey(conversation);
  const query = useQuery({ queryKey: key, queryFn: () => port.getConversation(conversation) });
  // A copilot answer can change the project (applied or autopilot) and other conversations, so the rest is re-read.
  const settled = (next: Conversation) => {
    client.setQueryData(key, next);
    void client.invalidateQueries({
      predicate: (cached) => !(cached.queryKey[0] === "copilot" && cached.queryKey[1] === conversation),
    });
  };
  // A refused answer (an outdated proposal, no model) shows the conversation as the engine has it now.
  const refused = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: previewKey(conversation) });
  };
  // The views may unmount (Apply also navigates), so results are handled on the promise, not per-call callbacks.
  const run = <Args,>(action: { mutateAsync: (args: Args) => Promise<Conversation> }, args: Args) => {
    void action.mutateAsync(args).then(settled, refused);
  };
  const send = useEngineAction(port.sendMessage);
  const apply = useEngineAction(port.applyProposal);
  const discard = useEngineAction(port.discardProposal);
  const autonomy = useEngineAction(port.setAutonomy);
  const attach = useEngineAction(port.attachFile);
  // The object selected in the editor, read from the explorer's cache without asking the engine again.
  const selection = () => {
    const tree = client.getQueryData(sceneKeys.tree(conversation));
    return typeof tree === "object" && tree !== null && "selected" in tree && typeof tree.selected === "string"
      ? tree.selected
      : null;
  };
  return (
    <QueryView query={query}>
      {(data) => (
        <ChatTab
          conversation={data}
          placeholder={placeholder}
          suggestionRoutes={suggestionRoutes}
          proposalRoutes={proposalRoutes}
          sending={send.isPending ? (send.variables?.text ?? null) : null}
          onSend={(text) =>
            run(send, { key: conversation, text, selection: selection(), workspace: workspaceOf(screen) })
          }
          onApply={(id) => run(apply, { key: conversation, id })}
          onDiscard={(id) => run(discard, { key: conversation, id })}
          onAttach={() => attach.mutate({ key: conversation })}
          onAutonomy={(mode) => run(autonomy, { key: conversation, mode })}
        />
      )}
    </QueryView>
  );
}
