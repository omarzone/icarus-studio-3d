// STA-BUILD-HARDWARE page
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { buildPort, type HardwareSession } from "../../../ports/build-port.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { CheckLine } from "../../copilot/chat-messages.tsx";
import { dialogButton } from "../dialog-button.tsx";
import { HardwareSteps } from "./hardware-steps.tsx";
import { SensorCalibration } from "./sensor-calibration.tsx";

// Runs the brain on a real device step by step: steps on the side, readings and fixes, then safety and parts.
export function HardwarePage({ project, projectName }: { project: string; projectName: string }) {
  const port = usePort(buildPort);
  const client = useQueryClient();
  const key = ["build", "hardware", project] as const;
  const session = useQuery({ queryKey: key, queryFn: () => port.getHardware(project) });
  const recheck = useEngineAction(port.recheckSensor);
  const skip = useEngineAction(port.skipSensor);
  const saved = { onSuccess: (next: HardwareSession) => client.setQueryData(key, next) };
  return (
    <QueryView query={session}>
      {(data) => {
        const failing = data.calibration.readings.find((reading) => !reading.ok)?.name;
        return (
          <div className="grid h-full min-h-0 grid-cols-[208px_minmax(0,1fr)]">
            <HardwareSteps steps={data.steps} />
            <main className="grid grid-cols-2 gap-5 overflow-hidden pt-4 pr-1.5 pl-3">
              <div className="flex flex-col gap-3.5">
                <h1 className="text-title-2 leading-[29px]">
                  Run {projectName} on your {data.device}
                </h1>
                <ConnectionLine connection={data.connection} />
                <SensorCalibration calibration={data.calibration} />
                {data.calibration.problem ? (
                  <p className="rounded-card-sm bg-warn-tint px-3.5 py-3 text-ui leading-4.5">
                    <b className="font-semibold">{data.calibration.problem.title}</b> {data.calibration.problem.fix}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Act
                    cta="Recheck"
                    disabled={!failing}
                    title={failing ? undefined : "Every sensor reads fine"}
                    onClick={() => failing && recheck.mutate({ project, sensor: failing }, saved)}
                    className={dialogButton("primary")}
                  >
                    Recheck
                  </Act>
                  <Act
                    cta="Skip this sensor"
                    disabled={!failing}
                    title={failing ? undefined : "Every sensor reads fine"}
                    onClick={() => failing && skip.mutate({ project, sensor: failing }, saved)}
                    className={dialogButton("secondary")}
                  >
                    Skip this sensor
                  </Act>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <div
                  role="img"
                  aria-label={`${projectName} on the real hardware`}
                  className="h-50 rounded-[18px] bg-control-raised"
                />
                <section className="flex flex-col gap-2 rounded-[18px] bg-control px-4 py-3.5 text-ui">
                  <h2 className="text-body leading-4 font-semibold">Safety</h2>
                  {data.safety.map((rule) => (
                    <CheckLine key={rule} item={{ text: rule, tone: "ok" }} />
                  ))}
                </section>
                <PartsList parts={data.parts} />
              </div>
            </main>
          </div>
        );
      }}
    </QueryView>
  );
}

function ConnectionLine({ connection }: { connection: HardwareSession["connection"] }) {
  if (!connection) {
    return <p className="leading-4 text-fg-secondary">No device connected yet.</p>;
  }
  return (
    <p className="leading-4 text-fg-secondary">
      Connected to <b className="font-semibold text-fg">{connection.host}</b> · {connection.board} ·{" "}
      {connection.sensorsFound} sensors found
    </p>
  );
}

function PartsList({ parts }: { parts: HardwareSession["parts"] }) {
  const total = parts.reduce((sum, part) => sum + part.usd, 0);
  return (
    <section className="flex flex-col gap-1.5 rounded-[18px] bg-control px-4 py-3.5 text-ui leading-4">
      <h2 className="text-body leading-4 font-semibold">Parts list</h2>
      {parts.map((part) => (
        <div key={part.name} className="flex justify-between">
          <span>{part.name}</span>
          <span className="font-mono text-fg-secondary">${part.usd}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1 font-semibold">
        <span>Total</span>
        <span>${total}</span>
      </div>
    </section>
  );
}
