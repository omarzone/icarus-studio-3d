import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ProjectsScreen } from "./projects-screen.tsx";

export const catalog: Catalog = {
  routes: [{ id: "SCR-PROJECTS", component: ProjectsScreen, maxDiff: 0.03 }],
};
