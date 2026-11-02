// PNL-CHAT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useCopilotOutbox } from "../../app/runtime/copilot-outbox.ts";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { sceneKeys } from "../../editor/scene-queries.ts";
import { CopilotBusy, CopilotNotConnected } from "../../ports/copilot-connection.ts";
import { type ChatAttachment, type Conversation, copilotPort } from "../../ports/copilot-port.ts";
import { workspaceOf } from "../../ports/copilot-views.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { useDockedPanel } from "../../ui/dock-slot.ts";
import { NOT_YET_CLASS, useNotYet } from "../../ui/not-yet.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import type { ReadFile } from "./attachment-reading.ts";
import { ChatTab, type SendingMessage } from "./chat-tab.tsx";
import { copilotKey, previewKey, useConversationKey } from "./conversation-key.ts";
import { HistoryTab } from "./history-tab.tsx";
import type { ProposalRoutes } from "./proposal-card.tsx";
import { useSceneLook } from "./scene-look.ts";
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
  // Undocked (Play), the panel's own ⋯ has nothing behind it yet.
  const notYet = useNotYet();
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
          <Act
            cta="Chat options"
            aria-label="Chat options"
            {...notYet?.("Chat options", "Clear the chat or export the conversation")}
            className={buttonClass("icon", `size-6! ${NOT_YET_CLASS}`)}
          >
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
  const go = useNavigation((state) => state.go);
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
  const lookAtScene = useSceneLook(conversation);
  const [sending, setSending] = useState<SendingMessage | null>(null);
  // Resolves whether the copilot got the message, so the composer can give back the text of a failed one.
  // Each message goes with fresh renders of the scene, so the copilot sees what it is editing.
  const sendText = async (text: string, attachments: readonly ChatAttachment[] = []) => {
    if (sending) {
      return false;
    }
    setSending({ text, attachments });
    try {
      const views = await lookAtScene();
      const next = await send.mutateAsync({
        key: conversation,
        text,
        selection: selection(),
        workspace: workspaceOf(screen),
        attachments: attachments.map((item) => item.id),
        views,
      });
      settled(next);
      return true;
    } catch {
      refused();
      return false;
    } finally {
      setSending(null);
    }
  };
  // A message asked from elsewhere (the getting-started guide) goes out as if typed here.
  const outgoing = useCopilotOutbox((state) => state.waiting);
  const take = useCopilotOutbox((state) => state.take);
  useEffect(() => {
    if (outgoing && outgoing.conversation === conversation && !sending) {
      take(outgoing.id);
      void sendText(outgoing.text);
    }
  });
  const upload = (file: ReadFile) => port.attachFile({ key: conversation, ...file });
  const apply = useEngineAction(port.applyProposal);
  const discard = useEngineAction(port.discardProposal);
  const autonomy = useEngineAction(port.setAutonomy);
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
          sending={sending}
          notConnected={send.error instanceof CopilotNotConnected ? send.error.message : null}
          busy={send.error instanceof CopilotBusy}
          acting={apply.isPending || discard.isPending}
          onSend={sendText}
          onApply={(id) => run(apply, { key: conversation, id })}
          onDiscard={(id) => run(discard, { key: conversation, id })}
          onApplyAndTrain={(id) =>
            void apply.mutateAsync({ key: conversation, id }).then((next) => {
              settled(next);
              go("MOD-START-TRAINING");
            }, refused)
          }
          onUpload={upload}
          onAutonomy={(mode) => run(autonomy, { key: conversation, mode })}
        />
      )}
    </QueryView>
  );
}
