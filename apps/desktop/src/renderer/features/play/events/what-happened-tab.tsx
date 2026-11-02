// TAB-WHAT-HAPPENED
import { Act } from "../../../app/navigation/go-to.tsx";
import { useRuntimeMode } from "../../../app/runtime/port.tsx";
import type { PlayEvent } from "../../../ports/play-port.ts";

const ROW = "grid grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-control px-1.5 py-0.75 text-left text-ui";

// Timestamped log of the behavior and of what the user did; in the design a line jumps there in the recording.
// The app has no recording to jump into yet, so its lines are plain text rather than buttons that do nothing.
export function WhatHappenedTab({ events }: { events: readonly PlayEvent[] }) {
  const app = useRuntimeMode() === "app";
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5">
      {events.map((event) => {
        const content = (
          <>
            <span className="font-mono text-fg-tertiary">{event.time}</span>
            <span>{event.text}</span>
          </>
        );
        const key = `${event.time} ${event.text}`;
        return app ? (
          <p key={key} className={ROW}>
            {content}
          </p>
        ) : (
          <Act
            key={key}
            cta={`Jump to ${event.time}`}
            title="Jump to this moment"
            className={`${ROW} hover:bg-fill-hover`}
          >
            {content}
          </Act>
        );
      })}
    </div>
  );
}
