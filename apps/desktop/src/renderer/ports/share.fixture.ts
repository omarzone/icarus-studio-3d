import type { SharePort, ShareSettings } from "./share-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
export const SHARE_FIXTURE: ShareSettings = {
  visibility: "link",
  link: "icarus.studio/p/park-pilot-7f3a",
  people: [
    { id: "p1", name: "Omar", initials: "O", detail: "you", role: "owner" },
    { id: "p2", name: "Mara", initials: "MA", detail: "mara@…", role: "editor" },
  ],
};

export function createShareFixture(): SharePort {
  const byProject = new Map<string, ShareSettings>();
  const settingsOf = (projectId: string) => byProject.get(projectId) ?? SHARE_FIXTURE;
  const update = (projectId: string, change: (settings: ShareSettings) => ShareSettings) => {
    const next = change(settingsOf(projectId));
    byProject.set(projectId, next);
    return next;
  };
  return {
    getShare: async (projectId) => settingsOf(projectId),
    setVisibility: async ({ projectId, visibility }) => update(projectId, (settings) => ({ ...settings, visibility })),
    invite: async ({ projectId, email }) =>
      update(projectId, (settings) => ({
        ...settings,
        people: [
          ...settings.people,
          {
            id: email,
            name: email.split("@")[0] ?? email,
            initials: email.slice(0, 2).toUpperCase(),
            detail: email,
            role: "editor",
          },
        ],
      })),
    setRole: async ({ projectId, personId, role }) =>
      update(projectId, (settings) => ({
        ...settings,
        people: settings.people.map((person) => (person.id === personId ? { ...person, role } : person)),
      })),
  };
}
