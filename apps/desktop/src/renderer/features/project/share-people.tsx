import { tokens } from "@icarus/ui-tokens";
import { ChevronDown } from "lucide-react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type Collaborator, type CollaboratorRole, sharePort } from "../../ports/share-port.ts";
import { useRefreshAfterAction } from "./open-project.ts";

const ROLE_LABELS: Record<CollaboratorRole, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function PeopleList({ projectId, people }: { projectId: string; people: readonly Collaborator[] }) {
  const port = usePort(sharePort);
  const setRole = useEngineAction(port.setRole);
  const refresh = useRefreshAfterAction();
  return (
    <ul className="flex flex-col gap-4">
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-2.5">
          <span
            style={{ backgroundColor: avatarColor(person.id), color: tokens.color.avatarInk }}
            className="grid size-7.5 shrink-0 place-items-center rounded-full text-meta font-bold"
          >
            {person.initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body leading-4">{person.name}</span>
            <span className="text-meta text-fg-tertiary">{person.detail}</span>
          </span>
          {person.role === "owner" ? (
            <span className="text-ui text-fg-secondary">{ROLE_LABELS.owner}</span>
          ) : (
            <Act
              cta={`${ROLE_LABELS[person.role]} ${person.name}`}
              aria-label={`${person.name}: ${ROLE_LABELS[person.role]}, change role`}
              onClick={() =>
                void setRole
                  .mutateAsync({ projectId, personId: person.id, role: person.role === "editor" ? "viewer" : "editor" })
                  .then(refresh, () => undefined)
              }
              className="flex h-7 items-center gap-1 rounded-control px-1.5 text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
            >
              {ROLE_LABELS[person.role]}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </Act>
          )}
        </li>
      ))}
    </ul>
  );
}

// Avatar colors are picked by a stable hash of the person id (tokens: color.avatar).
function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return tokens.color.avatar[hash % tokens.color.avatar.length] ?? tokens.color.avatar[0];
}
