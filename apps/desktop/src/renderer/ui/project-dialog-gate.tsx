import type { ReactNode } from "react";
import { Dialog } from "./dialog.tsx";
import { NoProjectState } from "./states.tsx";

type Props = {
  // The open project's key (from useOpenProjectId or useProjectKey); null in the app while no project is open.
  projectKey: string | null;
  title: string;
  children: (projectKey: string) => ReactNode;
};

// A dialog about the open project; opened in the app with none, it says so instead of showing sample data.
export function ProjectDialogGate({ projectKey, title, children }: Props) {
  if (projectKey === null) {
    return (
      <Dialog title={title}>
        <NoProjectState />
      </Dialog>
    );
  }
  return children(projectKey);
}
