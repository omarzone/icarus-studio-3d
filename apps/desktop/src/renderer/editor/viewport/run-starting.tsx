import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

// A booting run takes tens of seconds before its copies show, so the view says it is working and for how long.
export function RunStarting({ title, body }: { title: string; body: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-label={title} className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <LoaderCircle size={28} strokeWidth={1.5} className="animate-spin text-fg-secondary" aria-hidden />
      <p className="text-headline font-semibold">{title}</p>
      <p className="max-w-90 text-center text-body text-fg-tertiary">{body}</p>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-control">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-fg-secondary" />
      </div>
      <p className="font-mono text-meta text-fg-tertiary">{seconds} s</p>
    </div>
  );
}
