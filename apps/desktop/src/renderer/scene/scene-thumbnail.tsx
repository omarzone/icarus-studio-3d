import type { SceneDescription } from "@icarus/contracts";
import { skipToken, useQuery } from "@tanstack/react-query";
import { createThumbnailCache } from "./thumbnail-cache.ts";

const pictures = createThumbnailCache(64);

async function draw(load: () => Promise<SceneDescription>): Promise<string> {
  const scene = await load();
  const { renderSceneThumbnail } = await import("./thumbnail-renderer.ts");
  return renderSceneThumbnail(scene);
}

type Props = {
  // From `templateThumbnailKey` or `projectThumbnailKey`.
  cacheKey: string;
  // Null where there is no compiled scene to draw (sample data); the area keeps its plain look.
  load: (() => Promise<SceneDescription>) | null;
  className: string;
};

// A still picture of a compiled scene for a card; while loading it pulses, and without a picture it stays plain.
export function SceneThumbnail({ cacheKey, load, className }: Props) {
  const query = useQuery({
    queryKey: ["scene-thumbnail", cacheKey],
    queryFn: load ? () => pictures.get(cacheKey, () => draw(load)) : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (load && query.isSuccess) {
    return <img src={query.data} alt="" aria-hidden draggable={false} className={`${className} object-cover`} />;
  }
  const pulse = load && query.isPending ? " animate-pulse" : "";
  return <span aria-hidden className={`${className} bg-control-raised${pulse}`} />;
}
