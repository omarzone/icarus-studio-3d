import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RuntimeModeProvider } from "../app/runtime/port.tsx";
import type { CheckpointMark, Replay, RunList } from "../ports/training-port.ts";
import { useCheckpoints, useReplay } from "./training-queries.ts";

const episode = (label: string): Replay => ({
  scene: { revision: 1, bodies: [], lights: [], geoms: [] },
  label,
  outcome: "Time ran out",
  duration: 4,
  frames: [],
});

const mark = (label: string): CheckpointMark => ({ step: 0, label, result: "", best: false, replayable: true });

function Shown() {
  const replay = useReplay("p", 0);
  const checkpoints = useCheckpoints("p");
  return (
    <p>
      {replay.data?.label ?? "no replay"} / {checkpoints.data?.[0]?.label ?? "no checkpoints"}
    </p>
  );
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <RuntimeModeProvider mode="prototype">
      <QueryClientProvider client={client}>
        <Shown />
      </QueryClientProvider>
    </RuntimeModeProvider>,
  );
}

it("keeps each run's replay and checkpoints apart, so a newly selected run never shows another run's episode", () => {
  const client = new QueryClient();
  const runs = (selected: string): RunList => ({ selected, runs: [] });
  client.setQueryData(["training", "p", "runs"], runs("run-1"));
  const first = render(client);
  const keys = client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey);
  const replayKey = keys.find((key) => key.includes("replay"));
  const checkpointsKey = keys.find((key) => key.includes("checkpoints"));
  expect(first).toContain("no replay");
  if (!replayKey || !checkpointsKey) {
    throw new Error("the hooks registered no queries");
  }
  client.setQueryData(replayKey, episode("Run 1 episode"));
  client.setQueryData(checkpointsKey, [mark("Run 1 checkpoint")]);
  expect(render(client)).toContain("Run 1 episode / Run 1 checkpoint");

  client.setQueryData(["training", "p", "runs"], runs("run-2"));
  expect(render(client)).toContain("no replay / no checkpoints");
});
