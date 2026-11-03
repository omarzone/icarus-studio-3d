// TAB-CHAT
import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useLiveSteps } from "../../app/runtime/live-turn.ts";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import type { AutonomyMode, ChatAttachment, ChatMessage, Conversation } from "../../ports/copilot-port.ts";
import { CopilotNotConnectedState } from "../../ui/copilot-not-connected.tsx";
import { AgentStepsList } from "./agent-steps-list.tsx";
import { AnswerActionsBar } from "./answer-actions-bar.tsx";
import { answerOptions, type OptionsState } from "./answer-options.ts";
import { carriesFiles, pastedFiles, transferFiles } from "./attachment-intake.ts";
import type { ReadFile } from "./attachment-reading.ts";
import { BuildProgressCard } from "./build-progress-card.tsx";
import { ChatActions } from "./chat-actions.tsx";
import { ChosenOption, CopilotBubble, ThinkingBubble, UserBubble } from "./chat-messages.tsx";
import { CoachFindings } from "./coach-findings.tsx";
import { Composer } from "./composer.tsx";
import { ContextMeter } from "./context-meter.tsx";
import { FilmStrip } from "./film-strip.tsx";
import { MessageAttachments, SceneViewsStrip } from "./message-attachments.tsx";
import { PlanCard } from "./plan-card.tsx";
import { ProposalCard, type ProposalRoutes } from "./proposal-card.tsx";
import { LiveRunCard, MilestoneDivider, RunProgressCard } from "./run-progress-card.tsx";
import { SuggestionChips, type SuggestionRoutes } from "./suggestion-chips.tsx";
import { visibleSuggestions } from "./suggestion-visibility.ts";
import { useComposerAttachments } from "./use-composer-attachments.ts";
import { type ContextLoader, useContextUsage } from "./use-context-usage.ts";
import { useStickToBottom } from "./use-stick-to-bottom.ts";
import { WelcomeCard } from "./welcome-card.tsx";

// The message on its way to the copilot, shown until the answer arrives.
export type SendingMessage = { text: string; attachments: readonly ChatAttachment[] };

export type ChatTabProps = {
  conversation: Conversation;
  placeholder: string;
  suggestionRoutes: SuggestionRoutes;
  proposalRoutes?: ProposalRoutes;
  sending?: SendingMessage | null;
  // Why the copilot could not answer the last message because no model is connected.
  notConnected?: string | null;
  // The last message was not taken because the copilot is still answering the one before.
  busy?: boolean;
  // A proposal answer is on its way, so the buttons under answers wait.
  acting?: boolean;
  // Resolves true once the copilot has the message.
  onSend: (text: string, attachments?: readonly ChatAttachment[]) => Promise<boolean>;
  // Uploads a file added to the composer.
  onUpload: (file: ReadFile) => Promise<ChatAttachment>;
  onApply: (id: string) => void;
  onDiscard: (id: string) => void;
  // Applies a proposal, then opens the start training dialog; only the app offers it.
  onApplyAndTrain?: (id: string) => void;
  onAutonomy: (mode: AutonomyMode) => void;
  // Counts what the next message sends to the model, for the composer's context gauge.
  context?: ContextLoader;
};

// The conversation sticks to the bottom under a fade, then suggestion chips and the composer. Files dropped
// anywhere on the chat, pasted or picked wait in the composer until the message goes.
export function ChatTab(props: ChatTabProps) {
  const { conversation, sending } = props;
  const attachments = useComposerAttachments(props.onUpload);
  const list = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const meter = useContextUsage(
    props.context,
    attachments.ready.map((file) => file.id),
  );
  useStickToBottom(list, `${conversation.messages.length}:${sending?.text ?? ""}`, Boolean(sending));
  // The prototype shows every suggestion of the sample, as the design does.
  const app = useRuntimeMode() === "app";
  const liveSteps = useLiveSteps(useNavigation((state) => state.params.project));
  const suggestions = app ? visibleSuggestions(conversation, Boolean(sending)) : conversation.suggestions;
  // Likewise its options stay under every sample answer; in the app only the newest unanswered answer keeps them.
  const options = app ? answerOptions(conversation.messages, sending?.text ?? null) : null;
  return (
    <section
      aria-label="Copilot chat"
      className="relative flex h-full min-w-0 flex-col"
      onPaste={(event) => {
        const files = pastedFiles(event.clipboardData);
        if (files) {
          event.preventDefault();
          attachments.add(files);
        }
      }}
      onDragEnter={(event) => {
        if (carriesFiles([...event.dataTransfer.types])) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (carriesFiles([...event.dataTransfer.types])) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (carriesFiles([...event.dataTransfer.types])) {
          event.preventDefault();
          setDragging(false);
          attachments.add(transferFiles(event.dataTransfer));
        }
      }}
    >
      {props.notConnected ? (
        <div className="min-h-0 flex-1">
          <CopilotNotConnectedState detail={props.notConnected} />
        </div>
      ) : (
        <div
          ref={list}
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pt-2 [mask-image:linear-gradient(to_bottom,transparent_0,black_56px)]"
        >
          <div className="mt-auto flex min-w-0 flex-col gap-3.5">
            {app && conversation.messages.length === 0 && !sending ? (
              <WelcomeCard onSend={(text) => void props.onSend(text)} />
            ) : null}
            {conversation.messages.map((message) => (
              <Message key={message.id} message={message} options={options?.get(message.id) ?? LIVE} {...props} />
            ))}
            {sending ? (
              <>
                {sending.attachments.length > 0 ? <MessageAttachments attachments={sending.attachments} /> : null}
                <UserBubble text={sending.text} />
                <ThinkingBubble steps={liveSteps} />
              </>
            ) : null}
          </div>
        </div>
      )}
      {props.busy && !sending ? (
        <p role="status" className="mx-3 mb-1.5 rounded-control bg-control px-3 py-2 text-ui text-fg-secondary">
          The copilot is still working on your last message. Send this one again once it answers.
        </p>
      ) : null}
      <SuggestionChips suggestions={suggestions} routes={props.suggestionRoutes} onSend={props.onSend} />
      <Composer
        placeholder={props.placeholder}
        autonomy={conversation.autonomy}
        autonomyNote={conversation.autonomyNote}
        sending={Boolean(sending)}
        attachments={attachments}
        onSend={props.onSend}
        onAutonomy={props.onAutonomy}
        meter={meter ? <ContextMeter state={meter.state} onOpen={meter.refresh} /> : null}
      />
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-card border-[1.5px] border-dashed border-line-dashed bg-overlay">
          <span className="flex flex-col items-center gap-2 text-center text-body text-fg-secondary">
            <Paperclip size={22} strokeWidth={1.75} aria-hidden className="text-fg-tertiary" />
            Drop files to attach them to your message
            <span className="text-meta text-fg-tertiary">
              Images, videos, documents or .glb models, up to 15 MB each
            </span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

const LIVE: OptionsState = { show: "live" };

// The options once answered: the picked one in a quiet line, or nothing.
function Answered({ state }: { state: Exclude<OptionsState, { show: "live" }> }) {
  return state.show === "chosen" ? <ChosenOption label={state.label} /> : null;
}

function Message({
  message,
  options,
  proposalRoutes,
  suggestionRoutes,
  sending,
  acting,
  onApply,
  onDiscard,
  onApplyAndTrain,
  onSend,
}: ChatTabProps & { message: ChatMessage; options: OptionsState }) {
  switch (message.role) {
    case "user":
      return (
        <>
          {message.attachments && message.attachments.length > 0 ? (
            <MessageAttachments attachments={message.attachments} />
          ) : null}
          <UserBubble text={message.text} />
          {message.views && message.views.length > 0 ? <SceneViewsStrip views={message.views} /> : null}
        </>
      );
    case "copilot":
      return (
        <>
          {message.steps && message.steps.length > 0 ? <AgentStepsList steps={message.steps} /> : null}
          <CopilotBubble
            title={message.title}
            text={message.text}
            markdown={message.markdown}
            thinking={message.thinking}
            checks={message.checks}
            actions={
              options.show === "chosen" ? (
                <ChosenOption label={options.label} />
              ) : options.show === "none" ? undefined : message.actions ? (
                <ChatActions actions={message.actions} routes={suggestionRoutes} onSend={onSend} />
              ) : message.answerActions && message.answerActions.length > 0 ? (
                <AnswerActionsBar
                  actions={message.answerActions}
                  proposal={message.proposal ?? null}
                  busy={Boolean(sending) || Boolean(acting)}
                  onSend={(text) => void onSend(text)}
                  onApply={onApply}
                  onDiscard={onDiscard}
                  onApplyAndTrain={onApplyAndTrain}
                />
              ) : undefined
            }
          />
          {message.filmStrip ? <FilmStrip strip={message.filmStrip} /> : null}
          {message.findings && message.findings.length > 0 ? (
            <CoachFindings findings={message.findings} busy={Boolean(sending) || Boolean(acting)} onApply={onApply} />
          ) : null}
          {message.views && message.views.length > 0 ? (
            <SceneViewsStrip views={message.views} title="What the copilot saw" side="copilot" />
          ) : null}
        </>
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
    case "run":
      return <LiveRunCard runId={message.runId} />;
    case "plan":
      return (
        <PlanCard
          plan={message.plan}
          routes={suggestionRoutes}
          onSend={onSend}
          answered={options.show === "live" ? undefined : <Answered state={options} />}
        />
      );
  }
}
