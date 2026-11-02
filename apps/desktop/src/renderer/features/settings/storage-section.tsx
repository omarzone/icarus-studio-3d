// Storage section of SCR-SETTINGS-TRAINING: where projects and runs live, and moving them to another folder.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import {
  type DataFolderCheck,
  type DataFolderMove,
  type StorageSettings,
  settingsPort,
} from "../../ports/settings-port.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { DataFolderCard, MoveConfirm, MoveProgress, MoveResult, StorageProblem } from "./storage-views.tsx";

const POLL_MS = 500;
export const STORAGE_SECTION_ID = "settings-storage";

type Step =
  | { kind: "idle" }
  | { kind: "problem"; text: string }
  | { kind: "confirm"; check: DataFolderCheck }
  | { kind: "moving" }
  | { kind: "restarting"; move: DataFolderMove }
  | { kind: "result"; move: DataFolderMove };

export function StorageSection() {
  const settings = usePort(settingsPort);
  const query = useQuery({ queryKey: ["settings", "storage"], queryFn: settings.getStorage });
  const section = useRef<HTMLElement>(null);
  const focused = useNavigation((state) => state.params.focus === "storage");
  const loaded = query.data !== undefined;
  useEffect(() => {
    if (focused && loaded) {
      section.current?.scrollIntoView({ block: "start" });
    }
  }, [focused, loaded]);
  return (
    <section
      ref={section}
      id={STORAGE_SECTION_ID}
      aria-labelledby="settings-storage-title"
      className="flex flex-col gap-3"
    >
      <h2 id="settings-storage-title" className="m-0 text-headline leading-tight font-semibold">
        Storage
      </h2>
      <QueryView query={query}>{(storage) => <StorageBody storage={storage} />}</QueryView>
    </section>
  );
}

function StorageBody({ storage }: { storage: StorageSettings }) {
  const settings = usePort(settingsPort);
  const client = useQueryClient();
  // A move the engine is still making when the page opens is followed, not started again.
  const [step, setStep] = useState<Step>(storage.move.state === "moving" ? { kind: "moving" } : { kind: "idle" });
  const progress = useQuery({
    queryKey: ["settings", "storage", "move"],
    queryFn: settings.getDataFolderMove,
    enabled: step.kind === "moving",
    refetchInterval: POLL_MS,
  });
  const choose = useEngineAction(async (): Promise<Step> => {
    const choice = await settings.chooseDataFolder();
    if (choice.kind === "cancelled") {
      return { kind: "idle" };
    }
    if (choice.kind === "refused") {
      return { kind: "problem", text: choice.reason };
    }
    const check = await settings.checkDataFolder(choice.folder);
    return check.problem === null ? { kind: "confirm", check } : { kind: "problem", text: check.problem };
  });
  const change = useEngineAction(settings.changeDataFolder);
  const restart = useEngineAction(settings.restartEngine);

  const finished = step.kind === "moving" ? progress.data : undefined;
  useEffect(() => {
    if (finished === undefined || finished.state === "moving" || finished.state === "idle") {
      return;
    }
    if (finished.state === "failed" || !finished.restartNeeded) {
      setStep({ kind: "result", move: finished });
      return;
    }
    setStep({ kind: "restarting", move: finished });
    // The engine reads the data folder when it starts; every screen reads its data again from the new one.
    restart.mutate(undefined, {
      onSettled: () => {
        setStep({ kind: "result", move: finished });
        void client.invalidateQueries();
      },
    });
  }, [finished, restart, client]);

  const start = (moveData: boolean) => {
    if (step.kind !== "confirm") {
      return;
    }
    change.mutate(
      { folder: step.check.folder, moveData },
      {
        onSuccess: () => {
          client.removeQueries({ queryKey: ["settings", "storage", "move"] });
          setStep({ kind: "moving" });
        },
        onError: (error) => setStep({ kind: "problem", text: error.message }),
      },
    );
  };
  const idle = () => setStep({ kind: "idle" });

  return (
    <>
      <DataFolderCard
        storage={storage}
        busy={step.kind !== "idle" && step.kind !== "problem" && step.kind !== "result"}
        onChange={() => choose.mutate(undefined, { onSuccess: setStep })}
      />
      {step.kind === "problem" ? <StorageProblem text={step.text} onDismiss={idle} /> : null}
      {step.kind === "confirm" ? (
        <MoveConfirm
          check={step.check}
          busy={change.isPending}
          onMove={() => start(true)}
          onStartEmpty={() => start(false)}
          onCancel={idle}
        />
      ) : null}
      {step.kind === "moving" ? <MoveProgress move={progress.data ?? storage.move} restarting={false} /> : null}
      {step.kind === "restarting" ? <MoveProgress move={step.move} restarting /> : null}
      {step.kind === "result" ? <MoveResult move={step.move} onDismiss={idle} /> : null}
    </>
  );
}
