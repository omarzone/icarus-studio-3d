// TAB-WHAT-IT-DECIDES
import { GoTo } from "../../../app/navigation/go-to.tsx";
import type { LiveBar, PlayBrain, PlayBrainPick } from "../../../ports/play-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { MenuButton, type MenuEntry } from "../../../ui/menu.tsx";
import { LiveBarList } from "../live-bar-list.tsx";
import { brainEntries } from "./brain-entries.ts";

// Picking which trained brain plays; `brains` is undefined while they load.
export type BrainChoice = {
  brains: readonly PlayBrain[] | undefined;
  failure: string | undefined;
  playing: PlayBrainPick | undefined;
  onChoose: (brain: PlayBrainPick) => void;
};

type Props = { bars: readonly LiveBar[]; brain: string; choice?: BrainChoice };

// Live outputs of the brain and which brain is playing.
export function WhatItDecidesTab({ bars, brain, choice }: Props) {
  const className = buttonClass("secondary", "h-8.5! justify-start px-4! text-body!");
  return (
    <div className="flex flex-col gap-2.25 px-3.5 py-3">
      <LiveBarList bars={bars} />
      <p className="text-meta leading-normal text-fg-tertiary">{brain}</p>
      {choice ? (
        <MenuButton label="Use another brain" entries={entriesOf(choice)} className={className} align="start">
          Use another brain
        </MenuButton>
      ) : (
        <GoTo to="SCR-RESULTS" cta="Use another brain" className={className}>
          Use another brain
        </GoTo>
      )}
    </div>
  );
}

function entriesOf(choice: BrainChoice): MenuEntry[] {
  const idle = { disabled: true, run: () => undefined };
  if (choice.failure !== undefined) {
    return [{ label: "Trained brains could not be listed", hint: choice.failure, ...idle }];
  }
  if (choice.brains === undefined) {
    return [{ label: "Looking for trained brains…", ...idle }];
  }
  if (choice.brains.length === 0) {
    return [{ label: "No trained brains yet", hint: "Finish a training run in Train to get one.", ...idle }];
  }
  return brainEntries(choice.brains, choice.playing, choice.onChoose);
}
