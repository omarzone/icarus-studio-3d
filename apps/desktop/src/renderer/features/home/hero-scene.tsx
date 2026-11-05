import { skipToken, useQuery } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { templatesPort } from "../../ports/templates-port.ts";

// The template whose compiled scene sits behind the hero: four bodies, four brains, one course.
const HERO_TEMPLATE = "lanes_race";
const WIDTH = 1280;
const HEIGHT = 540;
// Close enough that the bodies read behind the headline, with the course running off the edges.
const MARGIN = 0.3;

// A still of a real template scene drawn by the same renderer as the viewport; plain until it is ready.
export function HeroScene() {
  const templates = usePort(templatesPort);
  const load = templates.templateScene;
  const query = useQuery({
    queryKey: ["hero-scene", HERO_TEMPLATE],
    queryFn: load
      ? async () => {
          const scene = await load(HERO_TEMPLATE);
          const { renderSceneView } = await import("../../scene/thumbnail-renderer.ts");
          return renderSceneView(scene, {
            view: "three-quarter",
            width: WIDTH,
            height: HEIGHT,
            type: "image/jpeg",
            margin: MARGIN,
          });
        }
      : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!query.isSuccess) {
    return null;
  }
  return (
    <img
      src={query.data}
      alt=""
      aria-hidden
      draggable={false}
      className="absolute inset-y-0 right-0 h-full w-[72%] object-cover [mask-image:linear-gradient(to_right,transparent,black_38%)]"
    />
  );
}
