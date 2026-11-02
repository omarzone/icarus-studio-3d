import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTICE_MS, useNotices } from "./notices.ts";

const titles = () => useNotices.getState().notices.map((notice) => notice.title);

describe("notices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotices.setState({ notices: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("leave by themselves so they never keep covering the controls under them", () => {
    useNotices.getState().notify({ title: "Paint is not available yet" });
    vi.advanceTimersByTime(NOTICE_MS - 1);
    expect(titles()).toEqual(["Paint is not available yet"]);
    vi.advanceTimersByTime(1);
    expect(titles()).toEqual([]);
  });

  it("show the same notice once, with the newest one's time", () => {
    const { notify } = useNotices.getState();
    notify({ title: "Paint is not available yet" });
    vi.advanceTimersByTime(NOTICE_MS / 2);
    notify({ title: "Props is not available yet" });
    notify({ title: "Paint is not available yet" });
    expect(titles()).toEqual(["Props is not available yet", "Paint is not available yet"]);
    vi.advanceTimersByTime(NOTICE_MS / 2);
    expect(titles()).toEqual(["Props is not available yet", "Paint is not available yet"]);
  });

  it("keep at most three", () => {
    for (const title of ["a", "b", "c", "d"]) {
      useNotices.getState().notify({ title });
    }
    expect(titles()).toEqual(["b", "c", "d"]);
  });
});
