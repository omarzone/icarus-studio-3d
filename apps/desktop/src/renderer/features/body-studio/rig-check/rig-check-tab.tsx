// TAB-RIG-CHECK
import { Act } from "../../../app/navigation/go-to.tsx";
import type { RigCheck } from "../../../ports/body-port.ts";
import { CheckLine } from "../../copilot/chat-messages.tsx";
import { PoseChips } from "./pose-chips.tsx";

type Props = { check: RigCheck; onPose: (id: string) => void; onSelectPart: (part: string) => void };

// Physics checks of the body, passes in green and problems in amber, next to the test poses. A problem about one
// part selects it; a failing design test is about the whole body, so it stays text.
export function RigCheckTab({ check, onPose, onSelectPart }: Props) {
  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-2.5 px-3 pt-2.5 pb-3">
      <div className="flex flex-col gap-2 rounded-card-sm bg-control p-3">
        <span className="leading-4 font-semibold">Rig check</span>
        {check.checks.map(({ part, ...item }) =>
          item.tone === "warn" && part !== undefined ? (
            <Act
              key={item.text}
              cta={item.text}
              title="Select the part"
              onClick={() => onSelectPart(part)}
              className="-mx-1 rounded-control px-1 text-left hover:bg-fill-hover active:opacity-80"
            >
              <CheckLine item={item} />
            </Act>
          ) : (
            <CheckLine key={item.text} item={item} />
          ),
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-card-sm bg-control p-3">
        <span className="leading-4 font-semibold">Test pose</span>
        <span className="text-ui text-fg-secondary">{check.poseHint}</span>
        <PoseChips poses={check.poses} onPose={onPose} />
      </div>
    </div>
  );
}
