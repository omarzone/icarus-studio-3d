import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { revisionsPort } from "../../../ports/revisions-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { GoTo } from "../../navigation/go-to.tsx";
import { usePort } from "../../runtime/port.tsx";

// The header's reminder that nothing needs saving: every change is already a revision; it opens History.
export function SavedIndicator({ project }: { project: string }) {
  const port = usePort(revisionsPort);
  const newest = useQuery({
    queryKey: ["revisions", project],
    queryFn: () => port.listRevisions(project),
    select: (list) => list[0],
  });
  // Loading, failed or engine away: the header claims nothing it has not seen.
  if (!newest.data) {
    return null;
  }
  const when = newest.data.savedAt ?? newest.data.when;
  return (
    <GoTo
      to="MOD-HISTORY"
      cta="Saved"
      title={`Every change is saved automatically. Last saved ${when} (r${newest.data.id}). Open History to go back to any version.`}
      className={buttonClass("ghost", "gap-1.5 rounded-full text-fg-tertiary")}
    >
      <Check size={12} strokeWidth={2} aria-hidden />
      <span className="max-[1440px]:hidden">Saved {when}</span>
    </GoTo>
  );
}
