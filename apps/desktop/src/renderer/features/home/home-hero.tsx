import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { HeroScene } from "./hero-scene.tsx";

// A real template scene sits behind the prompt; without the engine the surface stays plain.
export function HomeHero({ showIdeasHint }: { showIdeasHint: boolean }) {
  const go = useNavigation((state) => state.go);
  const [prompt, setPrompt] = useState("");
  return (
    <section className="relative h-67.5 shrink-0 overflow-hidden rounded-dialog bg-strip">
      <HeroScene />
      <div className="absolute top-11.5 left-9 flex w-135 flex-col gap-3">
        <h1 className="m-0 text-display leading-[1.05] font-semibold tracking-[-0.03em]">
          Train AI in 3D, from a sentence
        </h1>
        <p className="m-0 text-headline leading-tight font-normal text-fg-secondary">
          Describe it, import it or remix it. Watch it learn, then share it.
        </p>
        <label className="flex h-11.5 items-center rounded-card-sm bg-control pr-1.5 pl-3.5 hover:bg-control-raised has-focus:bg-control-raised">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && prompt.trim() !== "") {
                go("SCR-IDEAS", { prompt: prompt.trim() });
              }
            }}
            placeholder="A car that learns to park itself…"
            aria-label="Describe what to make"
            className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-tertiary"
          />
          <GoTo
            to="SCR-IDEAS"
            cta="Send"
            params={{ prompt: prompt.trim() }}
            aria-label="See ideas"
            className="grid size-8.5 shrink-0 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90 active:opacity-80"
          >
            <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
          </GoTo>
        </label>
        {showIdeasHint ? (
          <GoTo
            to="SCR-IDEAS"
            cta="Press enter to see 3 ideas →"
            params={{ prompt: prompt.trim() }}
            className="self-start text-ui leading-tight text-fg-tool underline hover:text-fg active:opacity-80"
          >
            Press enter to see 3 ideas →
          </GoTo>
        ) : null}
      </div>
    </section>
  );
}
