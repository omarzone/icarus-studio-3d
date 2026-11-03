// SCR-HOME, STA-HOME-EMPTY
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { communityPort } from "../../ports/community-port.ts";
import { projectsPort } from "../../ports/projects-port.ts";
import { templatesPort } from "../../ports/templates-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { LauncherPage } from "../../ui/launcher-page.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { CommunityStrip, CommunityStripHeader } from "./community-strip.tsx";
import { HomeHero } from "./home-hero.tsx";
import { RecentProjects } from "./recent-projects.tsx";
import { TemplateCards } from "./template-cards.tsx";

export function HomeScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const noProjectsYet = useNoProjectsYet(screen === "SCR-HOME");
  const firstLaunch = screen === "STA-HOME-EMPTY" || noProjectsYet;
  // The bare front door is drawn for a signed-out visitor, as in its reference; dialogs over it show the account.
  const signedOut = screen === "SCR-HOME" && overlay === null && !noProjectsYet;
  // Only the app has projects of its own to return to; the prototype keeps its design.
  const app = useRuntimeMode() === "app";
  return (
    <LauncherPage active="Home" activeGoesTo="SCR-HOME" signedOut={signedOut}>
      <div className="flex flex-col gap-4.5">
        <HomeHero showIdeasHint={!firstLaunch} />
        {app && !firstLaunch ? <RecentProjects /> : null}
        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-title-3 leading-tight font-semibold">Start from</h2>
          <Templates />
        </section>
        {firstLaunch ? <FirstLaunchCard /> : <FromTheCommunity />}
      </div>
    </LauncherPage>
  );
}

// In the app, Home is the first-launch state while the engine lists no projects.
function useNoProjectsYet(onHome: boolean): boolean {
  const app = useRuntimeMode() === "app";
  const projects = usePort(projectsPort);
  const query = useQuery({ queryKey: ["projects", "list"], queryFn: projects.listProjects, enabled: app && onHome });
  return app && onHome && query.data?.length === 0;
}

function Templates() {
  const templates = usePort(templatesPort);
  const query = useQuery({ queryKey: ["templates"], queryFn: templates.listTemplates });
  return (
    <QueryView query={query} isEmpty={(list) => list.length === 0} empty={<EmptyState title="No templates yet" />}>
      {(list) => <TemplateCards templates={list} scene={templates.templateScene} />}
    </QueryView>
  );
}

function FromTheCommunity() {
  const community = usePort(communityPort);
  const query = useQuery({
    queryKey: ["community", "featured", 4],
    queryFn: () => community.listCreations({ sort: "featured", category: null, search: "", limit: 4 }),
  });
  return (
    <section className="flex flex-col gap-2.5">
      <CommunityStripHeader />
      <QueryView
        query={query}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title="Nothing shared yet" body="Creations people publish appear here." />}
      >
        {(list) => <CommunityStrip creations={list} />}
      </QueryView>
    </section>
  );
}

function FirstLaunchCard() {
  return (
    <section className="flex items-center gap-4.5 rounded-bubble bg-control p-5.5">
      <span aria-hidden className="grid size-13 place-items-center rounded-card bg-control-raised">
        <Plus size={22} strokeWidth={1.75} />
      </span>
      <span className="flex flex-1 flex-col gap-0.75">
        <span className="text-headline leading-tight font-semibold">You have no creations yet</span>
        <span className="leading-tight text-fg-secondary">
          Describe an idea above, pick a starter, or open one from the community to see how it was made.
        </span>
      </span>
      <GoTo
        to="STA-WORLD-EMPTY"
        cta="Take the 3 minute tour"
        params={{}}
        title="Start an empty world with a checklist of the first steps"
        className={buttonClass("primary", "h-8.5 text-body")}
      >
        Take the 3 minute tour
      </GoTo>
    </section>
  );
}
