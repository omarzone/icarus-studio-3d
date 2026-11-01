// TAB-WEIGHTS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type BoneWeights, bodyPort } from "../../../ports/body-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";

// Skin weight coverage per bone of an imported mesh; gaps in amber, with an automatic fix.
export function WeightsTab({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const client = useQueryClient();
  const key = ["body", body, "weights"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getWeights(body) });
  const fix = useEngineAction(port.autoFixWeights);
  return (
    <QueryView
      query={query}
      isEmpty={(data) => data.bones.length === 0}
      empty={<EmptyState title="No skin weights" body="Built-in bodies have no mesh to paint." />}
    >
      {(weights) => (
        <div className="flex gap-3 px-3 pt-2.5 pb-3">
          <div className="grid flex-1 grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-x-2.5 gap-y-1.5 text-ui">
            {weights.bones.map((bone) => (
              <BoneRow key={bone.id} bone={bone} />
            ))}
          </div>
          <Act
            cta="Auto-fix weights"
            onClick={() => fix.mutate(body, { onSuccess: (next) => client.setQueryData(key, next) })}
            className={buttonClass("secondary", "shrink-0")}
          >
            Auto-fix weights
          </Act>
        </div>
      )}
    </QueryView>
  );
}

function BoneRow({ bone }: { bone: BoneWeights["bones"][number] }) {
  return (
    <>
      <span className="truncate" title={bone.problem}>
        {bone.name}
      </span>
      <span className="h-1.5 rounded-bar bg-control-raised">
        <span
          className={`block h-1.5 rounded-bar ${bone.problem ? "bg-warn" : "bg-fg"}`}
          style={{ width: `${bone.coverage * 100}%` }}
        />
      </span>
      <span className="text-right font-mono">{Math.round(bone.coverage * 100)}%</span>
    </>
  );
}
