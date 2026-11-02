import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

// The architect answers in about half a minute, so the wait says what is happening and how long it has run.
export function GeneratingIdeas() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      role="status"
      aria-label="Thinking of three ideas"
      className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin text-fg-tertiary" aria-hidden />
      <p className="text-headline font-semibold">The copilot is designing three ideas</p>
      <p className="max-w-90 text-body text-fg-tertiary">
        Each one is a real world and body, compiled and tested before you see it. This usually takes under a minute.
      </p>
      <p className="font-mono text-meta text-fg-tertiary">{seconds} s</p>
    </div>
  );
}
