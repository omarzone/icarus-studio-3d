import { definePort } from "../app/runtime/port.tsx";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import { serverVisibility, shareView } from "./community-views.ts";
import { createShareFixture } from "./share.fixture.ts";

export type ShareVisibility = "private" | "invited" | "link";

export type CollaboratorRole = "owner" | "editor" | "viewer";

export type Collaborator = {
  id: string;
  name: string;
  initials: string;
  // Second line under the name ("you", a shortened email).
  detail: string;
  role: CollaboratorRole;
};

export type ShareSettings = {
  visibility: ShareVisibility;
  link: string;
  people: Collaborator[];
};

export type SharePort = {
  getShare: (projectId: string) => Promise<ShareSettings>;
  setVisibility: (input: { projectId: string; visibility: ShareVisibility }) => Promise<ShareSettings>;
  invite: (input: { projectId: string; email: string }) => Promise<ShareSettings>;
  setRole: (input: { projectId: string; personId: string; role: CollaboratorRole }) => Promise<ShareSettings>;
};

// Sharing a project's community page: who can open it and who is invited, kept by the community service. The
// published creation follows these settings; before it is published they wait on its page.
export function createCommunityShare(
  api: Pick<CommunityApi, "share" | "setVisibility" | "invite" | "setRole"> = communityApi,
): SharePort {
  return {
    getShare: async (projectId) => shareView(await api.share(projectId)),
    setVisibility: async ({ projectId, visibility }) => {
      const current = await api.share(projectId);
      return shareView(await api.setVisibility(projectId, serverVisibility(visibility, current.visibility)));
    },
    invite: async ({ projectId, email }) => shareView(await api.invite(projectId, email.trim())),
    setRole: async ({ projectId, personId, role }) => {
      if (role === "owner") {
        throw new Error("A project keeps its one owner");
      }
      return shareView(await api.setRole(projectId, personId, role));
    },
  };
}

export const sharePort = definePort<SharePort>({
  app: createCommunityShare(),
  prototype: createShareFixture,
});
