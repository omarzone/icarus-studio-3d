import { skipToken, useQuery } from "@tanstack/react-query";
import { communityPort } from "../../ports/community-port.ts";
import { usePort } from "./port.tsx";

// A thumbnail or photo the community keeps, as a data URL once it has loaded; null while loading or without one.
export function useCommunityPicture(picture: string | null): string | null {
  const community = usePort(communityPort);
  const query = useQuery({
    queryKey: ["community", "picture", picture],
    queryFn: picture === null ? skipToken : () => community.getPicture(picture),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? null;
}
