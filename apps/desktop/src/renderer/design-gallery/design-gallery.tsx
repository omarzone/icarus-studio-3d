import { galleryRegistry } from "./gallery-registry.tsx";

export const GALLERY_PREFIX = "#/__design/";

export function galleryEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).get("gallery") === "1";
}

export function DesignGallery({ id }: { id: string }) {
  const render = galleryRegistry[id];
  return (
    <div data-design-root className="h-[900px] w-[1440px] overflow-hidden bg-app text-fg">
      {render ? render() : <p className="p-4 text-body text-fg-tertiary">No gallery entry for {id}</p>}
    </div>
  );
}
