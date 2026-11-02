import { useQuery } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectSummary, type ProjectsPort, projectsPort } from "../../ports/projects-port.ts";
import { SceneThumbnail } from "../../scene/scene-thumbnail.tsx";
import { projectThumbnailKey } from "../../scene/thumbnail-cache.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { lastOpened, lastWorkspace, workspaceStorage } from "../project/last-workspace.ts";
import { recentProjects } from "./recent-order.ts";

const SHOWN = 4;
// While loading and without projects the section takes no room; Home looks as before.
const QUIET = <span hidden />;

// The projects opened or edited last, to pick up where the person left off; without any it shows nothing.
export function RecentProjects() {
  const projects = usePort(projectsPort);
  const query = useQuery({ queryKey: ["projects", "list"], queryFn: projects.listProjects });
  const storage = workspaceStorage();
  return (
    <QueryView query={query} loading={QUIET} isEmpty={(list) => list.length === 0} empty={QUIET}>
      {(list) => (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center">
            <h2 className="m-0 text-title-3 leading-tight font-semibold">Recent projects</h2>
            <GoTo
              to="SCR-PROJECTS"
              cta="All projects"
              title="Every project saved on this computer"
              className={buttonClass("ghost", "ml-auto")}
            >
              All projects
            </GoTo>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {recentProjects(list, (id) => lastOpened(storage, id), SHOWN).map((project) => (
              <RecentCard key={project.id} project={project} scene={projects.projectScene} />
            ))}
          </div>
        </section>
      )}
    </QueryView>
  );
}

function RecentCard({ project, scene }: { project: ProjectSummary; scene: ProjectsPort["projectScene"] }) {
  return (
    <GoTo
      to={project.lastScreen ?? lastWorkspace(workspaceStorage(), project.id)}
      params={{ project: project.id }}
      cta={project.name}
      title={`Open ${project.name}`}
      className="flex flex-col overflow-hidden rounded-card bg-control text-left hover:bg-control-raised active:opacity-80"
    >
      <SceneThumbnail
        cacheKey={projectThumbnailKey(project.id, project.revision)}
        load={scene ? () => scene(project.id) : null}
        className="h-28 w-full"
      />
      <span className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate leading-tight font-semibold">{project.name}</span>
        <span className="truncate text-meta text-fg-tertiary">{project.statusLine}</span>
      </span>
    </GoTo>
  );
}
