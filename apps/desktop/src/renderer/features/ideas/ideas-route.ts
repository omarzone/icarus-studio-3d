import type { RouteParams } from "../../app/navigation/navigation-store.tsx";

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"] as const;

// Ideas come before any project, so a project left over from the last screen must not steer its tabs.
export function ideasRouteParams(params: RouteParams): RouteParams {
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== "project"));
}

export function waysToBuildTitle(count: number): string {
  const word = COUNT_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? "way" : "ways"} to build it`;
}
