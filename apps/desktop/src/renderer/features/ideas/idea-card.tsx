import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { ScenePreview } from "../../editor/viewport/scene-preview.tsx";
import type { Idea } from "../../ports/ideas-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";

type Props = { idea: Idea; onUse: () => void; onTweak: (words: string) => Promise<unknown> };

// One generated alternative: real 3D preview on top, what it is, how long it trains, then Use this and Tweak.
export function IdeaCard({ idea, onUse, onTweak }: Props) {
  const [tweaking, setTweaking] = useState(false);
  return (
    <article aria-label={idea.title} className="relative flex flex-col overflow-hidden rounded-[18px] bg-control">
      <div role="img" aria-label={`Preview of ${idea.title}`} className="relative h-85 shrink-0 bg-panel">
        {idea.scene ? <ScenePreview description={idea.scene} /> : null}
        {idea.recommended ? (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-selected px-2.5 py-1 text-meta font-semibold text-on-selected">
            Recommended
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2.25 p-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-headline leading-tight font-semibold">{idea.title}</span>
          {idea.source ? <span className="text-meta text-fg-tertiary">{idea.source}</span> : null}
        </span>
        <Line label="World" value={idea.world} />
        <Line label="Body" value={idea.body} />
        <Line label="Learns" value={idea.learns} />
        <span className="text-ui leading-tight text-fg-tertiary">Training on your computer: {idea.estimate}</span>
        {tweaking ? <TweakField title={idea.title} onTweak={onTweak} onDone={() => setTweaking(false)} /> : null}
        <div className="mt-auto flex gap-1.5">
          <GoTo
            to="STA-WORLD-BUILDING"
            cta="Use this"
            onClick={onUse}
            className={buttonClass(idea.recommended ? "primary" : "secondary", "h-8.5! px-4! text-body!")}
          >
            Use this
          </GoTo>
          <Act
            cta="Tweak"
            aria-expanded={tweaking}
            onClick={() => setTweaking(!tweaking)}
            className={buttonClass("secondary", "h-8.5! px-4! text-body!")}
          >
            Tweak
          </Act>
        </div>
      </div>
      {idea.recommended ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[18px] shadow-[inset_0_0_0_1.5px_var(--ic-fg)]"
        />
      ) : null}
    </article>
  );
}

// What to change, in the person's words; the copilot revises the idea and tests it again before the card updates.
function TweakField({
  title,
  onTweak,
  onDone,
}: {
  title: string;
  onTweak: (words: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const send = () => {
    if (!words.trim() || busy) {
      return;
    }
    setBusy(true);
    onTweak(words.trim()).then(onDone, () => setBusy(false));
  };
  return (
    <div className="flex gap-1.5">
      <input
        data-cta="What to change"
        aria-label={`What to change in ${title}`}
        placeholder="What should change?"
        value={words}
        disabled={busy}
        maxLength={1000}
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            send();
          }
        }}
        className="h-8.5 min-w-0 flex-1 rounded-button bg-control-raised px-3 text-body outline-none placeholder:text-fg-tertiary hover:bg-fill-hover focus:bg-fill-hover disabled:opacity-60"
      />
      <Act
        cta="Change it"
        disabled={busy || !words.trim()}
        onClick={send}
        className={buttonClass("primary", "h-8.5! px-3.5! text-body!")}
      >
        {busy ? "Changing…" : "Change it"}
      </Act>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2 text-ui leading-tight">
      <span className="text-fg-tertiary">{label}</span>
      <span>{value}</span>
    </div>
  );
}
