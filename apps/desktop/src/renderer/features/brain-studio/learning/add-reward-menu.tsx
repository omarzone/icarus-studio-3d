import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { brainPort, type Learning } from "../../../ports/brain-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { MenuButton, type MenuEntry } from "../../../ui/menu.tsx";

// The Reward tab's +: the library terms that fit the task and are not in the reward yet.
export function AddRewardMenu({ brain, onAdded }: { brain: string; onAdded: (learning: Learning) => void }) {
  const port = usePort(brainPort);
  const options = useQuery({
    queryKey: ["brain", brain, "reward-options"],
    queryFn: () => port.getRewardOptions(brain),
  });
  const add = useEngineAction(port.addRewardTerm);
  const entries: MenuEntry[] =
    options.data && options.data.length > 0
      ? options.data.map((option) => ({
          label: option.name,
          hint: option.detail,
          run: () => add.mutate({ brain, term: option.term }, { onSuccess: onAdded }),
        }))
      : [{ label: optionsNote(options.isError, options.data?.length), run: () => undefined }];
  return (
    <MenuButton label="Add reward term" entries={entries} className={buttonClass("icon", "size-6!")}>
      <Plus size={14} strokeWidth={1.75} aria-hidden />
    </MenuButton>
  );
}

function optionsNote(failed: boolean, count: number | undefined): string {
  if (failed) {
    return "The library could not be loaded";
  }
  return count === 0 ? "Every term that fits this task is in the reward" : "Loading the library…";
}
