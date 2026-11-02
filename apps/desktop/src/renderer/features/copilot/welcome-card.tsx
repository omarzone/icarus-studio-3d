import { Act } from "../../app/navigation/go-to.tsx";

// Raised chips, since they sit on the grey bubble.
const starterClass =
  "flex min-h-7 max-w-full items-center rounded-full bg-control-raised px-3 py-1.5 text-left text-ui leading-4 wrap-break-word text-fg-tool hover:bg-fill-hover hover:text-fg active:opacity-80";

const STARTERS = ["Design something from a sentence", "Explain this project", "Train it"] as const;

// An empty conversation in the app: what the copilot can do, with starters that go out as typed messages.
export function WelcomeCard({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex max-w-[calc(92%+28px)] flex-col gap-2.5 self-start rounded-bubble bg-control px-3.5 py-3 text-body leading-[1.55]">
      <span className="font-semibold">Hi, what should we build?</span>
      <span>
        Describe a world, a body or a skill in a sentence and I will design it, test it and train it with you.
      </span>
      <div className="flex flex-wrap gap-1.5">
        {STARTERS.map((text) => (
          <Act key={text} cta={text} onClick={() => onSend(text)} className={starterClass}>
            {text}
          </Act>
        ))}
      </div>
    </div>
  );
}
