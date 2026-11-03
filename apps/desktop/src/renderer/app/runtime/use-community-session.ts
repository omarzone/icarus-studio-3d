import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// Every read that depends on who is signed in to the community.
export const COMMUNITY_READS = [
  ["account"],
  ["profile"],
  ["community"],
  ["notifications"],
  ["moderation"],
  ["publish"],
  ["share"],
  ["settings", "privacy"],
  ["settings", "notifications"],
] as const;

// Reads again everything that depends on the community account when someone signs in or out, including a sign-in
// finished later in the browser.
export function useCommunitySession(): void {
  const client = useQueryClient();
  useEffect(
    () =>
      window.icarus.community.onSession(() => {
        for (const queryKey of COMMUNITY_READS) {
          void client.invalidateQueries({ queryKey });
        }
      }),
    [client],
  );
}
