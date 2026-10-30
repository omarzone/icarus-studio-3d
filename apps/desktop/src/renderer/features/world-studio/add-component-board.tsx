// POP-ADD-COMPONENT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { AddComponentMenu } from "../../editor/inspector/add-component-menu.tsx";
import { InspectorBody } from "../../editor/inspector/inspector-panel.tsx";
import { useSceneCache } from "../../editor/scene-queries.ts";
import { type Conversation, copilotPort } from "../../ports/copilot-port.ts";
import { scenePort } from "../../ports/scene-port.ts";
import { BoardTitleBar } from "../../ui/board-title-bar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { CheckList, UserBubble } from "../copilot/chat-messages.tsx";
import { copilotKey } from "../copilot/chat-panel.tsx";
import { ProposalCard } from "../copilot/proposal-card.tsx";

// Components of an imported object with the Add component picker open, shown on its reference board.
const SCENE = "robot-arm";

const RULES = [
  "Any object is a list of components, built-in or imported",
  "Each component brings its own properties, always with the same 12 types",
  "The copilot adds components the same way you do, and you approve them",
  "Senses on the body decide which Play tools appear",
].map((text) => ({ text, tone: "ok" as const }));

export function AddComponentBoard() {
  const port = usePort(scenePort);
  const cache = useSceneCache(SCENE);
  const add = useEngineAction(port.addComponent);
  return (
    <div
      role="dialog"
      aria-label="Add component"
      className="absolute inset-0 z-40 flex flex-col border border-line-strong bg-app text-fg"
    >
      <BoardTitleBar title="Inspector · components" />
      <main className="grid min-h-0 flex-1 grid-cols-[360px_420px_minmax(0,1fr)] gap-6 px-7.5 py-5.5">
        <section aria-label="Components" className="min-h-0 overflow-auto rounded-card border border-line bg-panel">
          <InspectorBody scene={SCENE} addComponentTo="POP-ADD-COMPONENT" board />
        </section>
        <div className="flex flex-col gap-2.5">
          <h2 className="leading-tight font-semibold">Add component</h2>
          <AddComponentMenu
            highlighted="touch"
            onPick={(kind) => add.mutate({ scene: SCENE, kind }, { onSuccess: cache.inspection })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <h1 className="text-title-1 font-semibold">Works for anything you can imagine</h1>
          <p className="text-body leading-normal text-fg-secondary">
            A robot arm you imported, a fly, a car or a tree: they are all objects made of components. Add a Touch
            sensor to a hand, a Motor to a joint or a Randomize component to anything that should change between
            training copies.
          </p>
          <div className="flex flex-col gap-2">
            <CheckList items={RULES} />
          </div>
          <div className="flex gap-2">
            <GoTo
              to="REF-PROPERTY-TYPES"
              cta="Property types"
              className={buttonClass("secondary", "h-8.5! px-4! text-body!")}
            >
              Property types
            </GoTo>
            <GoTo to="SCR-WORLD" cta="Back to the editor" className={buttonClass("primary", "h-8.5! text-body!")}>
              Back to the editor
            </GoTo>
          </div>
          <h2 className="mt-2 font-semibold">Or ask for it</h2>
          <AskForIt />
        </div>
      </main>
    </div>
  );
}

function AskForIt() {
  const port = usePort(copilotPort);
  const client = useQueryClient();
  const key = copilotKey(SCENE);
  const chat = useQuery({ queryKey: key, queryFn: () => port.getConversation(SCENE) });
  const update = { onSuccess: (next: Conversation) => client.setQueryData(key, next) };
  const apply = useEngineAction(port.applyProposal);
  const discard = useEngineAction(port.discardProposal);
  return (
    <QueryView query={chat}>
      {(data) => (
        <div className="flex flex-col gap-3.5">
          {data.messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} text={message.text} />
            ) : message.role === "proposal" ? (
              <ProposalCard
                key={message.id}
                proposal={message.proposal}
                className="max-w-115"
                onApply={() => apply.mutate({ key: SCENE, id: message.proposal.id }, update)}
                onDiscard={() => discard.mutate({ key: SCENE, id: message.proposal.id }, update)}
              />
            ) : null,
          )}
        </div>
      )}
    </QueryView>
  );
}
