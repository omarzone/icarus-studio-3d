// Pictures of compiled scenes kept for the session, so a card never draws the same scene twice.
export type ThumbnailCache = { get: (key: string, draw: () => Promise<string>) => Promise<string> };

export const templateThumbnailKey = (templateId: string) => `template:${templateId}`;

export const projectThumbnailKey = (projectId: string, revision: string) => `project:${projectId}:${revision}`;

// Least recently used pictures go first past `capacity`; a failed drawing is forgotten so it can be retried.
export function createThumbnailCache(capacity: number): ThumbnailCache {
  const pictures = new Map<string, Promise<string>>();
  return {
    get: (key, draw) => {
      const kept = pictures.get(key);
      if (kept) {
        pictures.delete(key);
        pictures.set(key, kept);
        return kept;
      }
      const drawn = draw();
      pictures.set(key, drawn);
      drawn.catch(() => {
        if (pictures.get(key) === drawn) {
          pictures.delete(key);
        }
      });
      for (const oldest of pictures.keys()) {
        if (pictures.size <= capacity) {
          break;
        }
        pictures.delete(oldest);
      }
      return drawn;
    },
  };
}
