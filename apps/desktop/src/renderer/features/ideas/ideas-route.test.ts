import { expect, it } from "vitest";
import { ideasRouteParams, waysToBuildTitle } from "./ideas-route.ts";

it("drops the previous project from the Ideas route and keeps the prompt and idea set", () => {
  expect(ideasRouteParams({ project: "walker", prompt: "a rover", ideaSet: "s1" })).toEqual({
    prompt: "a rover",
    ideaSet: "s1",
  });
});

it("names the count of ways in singular and plural", () => {
  expect(waysToBuildTitle(1)).toBe("One way to build it");
  expect(waysToBuildTitle(3)).toBe("Three ways to build it");
  expect(waysToBuildTitle(9)).toBe("9 ways to build it");
});
