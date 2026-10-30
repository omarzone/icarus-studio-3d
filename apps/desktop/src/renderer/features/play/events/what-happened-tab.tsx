// TAB-WHAT-HAPPENED
import { Act } from "../../../app/navigation/go-to.tsx";
import type { PlayEvent } from "../../../ports/play-port.ts";

// Timestamped log of the behavior and of what the user did; a line jumps there in the recording.
export function WhatHappenedTab({ events }: { events: readonly PlayEvent[] }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5">
      {events.map((event) => (
        <Act
          key={`${event.time} ${event.text}`}
          cta={`Jump to ${event.time}`}
          title="Jump to this moment"
          className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-control px-1.5 py-0.75 text-left text-ui hover:bg-fill-hover"
        >
          <span className="font-mono text-fg-tertiary">{event.time}</span>
          <span>{event.text}</span>
        </Act>
      ))}
    </div>
  );
}
