import type { ReactNode } from "react";
import type { RouteId } from "../app/navigation/catalog-id.ts";
import { Act } from "../app/navigation/go-to.tsx";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../app/runtime/engine-query.tsx";

type Props = {
  cta: string;
  // Where to go once the action worked; back to the screen underneath when omitted.
  to?: RouteId;
  run: () => Promise<unknown>;
  className: string;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
};

// A control that runs a port action and leaves only when it worked; a pending action shows its notice and stays.
export function ActionButton({ cta, to, run, className, disabled, title, children }: Props) {
  const screen = useNavigation((state) => state.screen);
  const go = useNavigation((state) => state.go);
  const close = useNavigation((state) => state.close);
  const action = useEngineAction(run);
  return (
    <Act
      cta={cta}
      data-goes-to={to ?? screen}
      disabled={disabled || action.isPending}
      title={title}
      onClick={() => action.mutate(undefined, { onSuccess: () => (to ? go(to) : close()) })}
      className={className}
    >
      {children}
    </Act>
  );
}
