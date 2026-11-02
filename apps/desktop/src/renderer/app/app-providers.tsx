import type { ReactNode } from "react";
import { type NavigationLocation, NavigationProvider, type NavigationStart } from "./navigation/navigation-store.tsx";
import { EngineQueryProvider } from "./runtime/engine-query.tsx";
import { type RuntimeMode, RuntimeModeProvider } from "./runtime/port.tsx";

export function AppProviders({
  mode,
  initial,
  children,
}: {
  mode: RuntimeMode;
  initial: NavigationStart;
  children: ReactNode;
}) {
  return (
    <RuntimeModeProvider mode={mode}>
      <EngineQueryProvider>
        <NavigationProvider initial={initial}>{children}</NavigationProvider>
      </EngineQueryProvider>
    </RuntimeModeProvider>
  );
}

export const HOME: NavigationLocation = { screen: "SCR-HOME", overlay: null, params: {} };
