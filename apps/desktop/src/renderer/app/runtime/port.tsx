import { createContext, type ReactNode, useContext } from "react";

// "app" talks to the engine (or a pending stub); "prototype" uses fixture data so every flow can be clicked through.
export type RuntimeMode = "app" | "prototype";

const RuntimeModeContext = createContext<RuntimeMode>("app");

export function RuntimeModeProvider({ mode, children }: { mode: RuntimeMode; children: ReactNode }) {
  return <RuntimeModeContext.Provider value={mode}>{children}</RuntimeModeContext.Provider>;
}

export function useRuntimeMode(): RuntimeMode {
  return useContext(RuntimeModeContext);
}

// A boundary to the engine: screens only see the port type, never where the data comes from.
export type PortDefinition<Port> = { app: Port; prototype: () => Port };

export function definePort<Port>(definition: PortDefinition<Port>): PortDefinition<Port> {
  return definition;
}

const prototypes = new WeakMap<PortDefinition<unknown>, unknown>();

export function usePort<Port>(definition: PortDefinition<Port>): Port {
  const mode = useRuntimeMode();
  if (mode === "app") {
    return definition.app;
  }
  const cached = prototypes.get(definition);
  if (cached !== undefined) {
    // SAFETY: the map only stores values created by this definition's own prototype factory.
    return cached as Port;
  }
  const created = definition.prototype();
  prototypes.set(definition, created);
  return created;
}
