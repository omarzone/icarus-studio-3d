// SCR-PROJECTS
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp, FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectStatus, type ProjectSummary, type ProjectsPort, projectsPort } from "../../ports/projects-port.ts";
import { SceneThumbnail } from "../../scene/scene-thumbnail.tsx";
import { projectThumbnailKey } from "../../scene/thumbnail-cache.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { LauncherPage } from "../../ui/launcher-page.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { type PillTone, StatusPill } from "../../ui/status-pill.tsx";

type Empty = { title: string; body: string };

const NO_MATCH: Empty = { title: "Nothing here", body: "No project matches this filter." };

const FILTERS = [
  { label: "All", statuses: null, empty: NO_MATCH },
  {
    label: "Training",
    statuses: ["training"],
    empty: { title: "Nothing training", body: "Projects with a training run in progress show here." },
  },
  { label: "Drafts", statuses: ["draft"], empty: NO_MATCH },
  {
    label: "Published",
    statuses: ["published"],
    empty: { title: "Nothing published", body: "Publishing to the community is not available yet." },
  },
] as const satisfies readonly { label: string; statuses: readonly ProjectStatus[] | null; empty: Empty }[];

type Filter = (typeof FILTERS)[number]["label"];

const TONES: Record<ProjectStatus, PillTone> = {
  training: "ok",
  published: "ok",
  attention: "warn",
  tested: "neutral",
  draft: "neutral",
};

export function ProjectsScreen() {
  const projects = usePort(projectsPort);
  const query = useQuery({ queryKey: ["projects"], queryFn: projects.listProjects });
  const [filter, setFilter] = useState<Filter>("All");
  const active = FILTERS.find((item) => item.label === filter);
  const statuses = active?.statuses ?? null;
  return (
    <LauncherPage active="Projects">
      <div className="flex flex-col gap-4.5 pt-1.5">
        <div className="flex items-center gap-3.5">
          <h1 className="m-0 text-title-1 leading-tight font-semibold">Projects</h1>
          <Segmented
            items={FILTERS.map((item) => ({
              label: item.label,
              active: item.label === filter,
              onSelect: () => setFilter(item.label),
            }))}
          />
          <span className="ml-auto flex gap-2">
            <GoTo
              to="MOD-IMPORT"
              cta="Open a file"
              title="Bring in a model, robot or environment from a file"
              className={buttonClass("secondary", "h-8.5 gap-1.75 px-4 text-body")}
            >
              <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
              Open a file
            </GoTo>
            {/* No route parameters: a project opened before must not be reopened as the "new" one. */}
            <GoTo
              to="STA-WORLD-EMPTY"
              cta="New project"
              params={{}}
              title="Start an empty world with the getting-started checklist"
              className={buttonClass("primary", "h-8.5 gap-1.75 text-body")}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              New project
            </GoTo>
          </span>
        </div>
        <p className="m-0 leading-normal text-fg-tertiary">
          Saved on this computer. Only what you publish goes to the community.
        </p>
        <QueryView
          query={query}
          isEmpty={(list) => list.length === 0}
          empty={<EmptyState title="No projects yet" body="Describe an idea on Home or start a new project." />}
        >
          {(list) => (
            <ProjectGrid
              scene={projects.projectScene}
              empty={active?.empty ?? NO_MATCH}
              projects={list.filter((project) => statuses === null || statuses.some((s) => s === project.status))}
            />
          )}
        </QueryView>
      </div>
    </LauncherPage>
  );
}

type Scene = ProjectsPort["projectScene"];

function ProjectGrid({ projects, scene, empty }: { projects: readonly ProjectSummary[]; scene: Scene; empty: Empty }) {
  if (projects.length === 0) {
    return <EmptyState title={empty.title} body={empty.body} />;
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} scene={scene} />
      ))}
    </div>
  );
}

function ProjectCard({ project, scene }: { project: ProjectSummary; scene: Scene }) {
  const votes = project.votes === undefined ? "" : ` ·\n${project.votes}`;
  return (
    <GoTo
      to={project.lastScreen ?? "SCR-WORLD"}
      params={{ project: project.id }}
      cta={`${project.name}\n${project.statusLine}${votes}`}
      className="flex flex-col overflow-hidden rounded-card bg-control text-left hover:bg-control-raised active:opacity-80"
    >
      <SceneThumbnail
        cacheKey={projectThumbnailKey(project.id, project.revision)}
        load={scene ? () => scene(project.id) : null}
        className="h-42.5 w-full"
      />
      <span className="flex flex-col items-start gap-1.5 px-3.5 py-3">
        <span className="leading-tight font-semibold">{project.name}</span>
        <StatusPill tone={TONES[project.status]}>
          {project.statusLine}
          {project.votes === undefined ? null : (
            <>
              {" ·"}
              <ArrowBigUp size={12} strokeWidth={1.75} aria-hidden />
              {project.votes}
            </>
          )}
        </StatusPill>
      </span>
    </GoTo>
  );
}
