// TAB-RECORDINGS
import type { Recording } from "../../../ports/results-port.ts";

// Reference recordings imported for comparison.
export function RecordingsTab({ recordings }: { recordings: readonly Recording[] }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {recordings.map((recording) => (
        <div key={recording.id} className="flex flex-col gap-0.5 px-2.5 py-2">
          <span>{recording.name}</span>
          <span className="text-meta text-fg-tertiary">{recording.detail}</span>
        </div>
      ))}
    </div>
  );
}
