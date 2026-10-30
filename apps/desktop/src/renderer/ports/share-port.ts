import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
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

export const sharePort = definePort<SharePort>({
  app: {
    getShare: pending({ key: "share.get", summary: "Sharing a project", sprint: 13, ids: ["MOD-SHARE"] }),
    setVisibility: pending({
      key: "share.visibility",
      summary: "Changing who can open a project",
      sprint: 13,
      ids: ["MOD-SHARE"],
    }),
    invite: pending({ key: "share.invite", summary: "Inviting people to a project", sprint: 13, ids: ["MOD-SHARE"] }),
    setRole: pending({
      key: "share.role",
      summary: "Changing what a collaborator can do",
      sprint: 13,
      ids: ["MOD-SHARE"],
    }),
  },
  prototype: createShareFixture,
});
