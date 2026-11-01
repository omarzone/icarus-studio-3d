import { describe, expect, it } from "vitest";
import { status, trainPoint } from "./testdata/training-runs.ts";
import { liveMetrics } from "./training-metrics.ts";

const labels = new Map([
  ["reach_goal", "Park in the spot"],
  ["progress", "Get closer"],
  ["collision", "Touching cars"],
]);

describe("live metrics", () => {
  it("says how far the run is and how fast it trains", () => {
    expect(liveMetrics(status(), [], labels).progress).toBe("312k / 1M · 1,840 steps/s");
    expect(liveMetrics(status({ state: "stopped" }), [], labels).progress).toBe("312k / 1M · stopped");
  });

  it("has no series before the first training episodes", () => {
    const metrics = liveMetrics(status(), [], labels);
    expect(metrics.series).toEqual([]);
    expect(metrics.breakdown.terms).toEqual([]);
  });

  it("plots return, success, failures and episode length from the training points", () => {
    const points = [0, 1, 2, 3, 4].map((index) =>
      trainPoint(index * 16_384, {
        episode_return: 10 + index * 10,
        success_rate: index * 0.1,
        failure_rate: 0.9 - index * 0.1,
        episode_length: 400 - index * 50,
      }),
    );
    const [ret, success, failures, length] = liveMetrics(status(), points, labels).series;
    expect(ret).toEqual({
      label: "Mean return",
      value: "50.0",
      change: { text: "+25%", tone: "ok" },
      meaning: "primary",
      samples: [10, 20, 30, 40, 50],
      min: 0,
      max: 55,
    });
    expect(success).toMatchObject({ label: "Success", value: "40%", change: { text: "+10 pts", tone: "ok" } });
    expect(success?.samples).toEqual([0, 10, 20, 30, 40]);
    expect(success).toMatchObject({ min: 0, max: 100, meaning: "primary" });
    expect(failures).toMatchObject({ label: "Failures", value: "50%", meaning: "danger" });
    expect(failures?.change).toEqual({ text: "−10 pts", tone: "ok" });
    expect(length).toMatchObject({ label: "Episode length", value: "200", change: { text: "−20%", tone: "neutral" } });
  });

  it("leaves out success and failures for tasks without a goal, and plots evaluations when nothing trained yet", () => {
    const evals = [trainPoint(0, { kind: "eval", episode_return: -2 }), trainPoint(25_000, { kind: "eval" })];
    const series = liveMetrics(status(), evals, labels).series;
    expect(series.map((item) => item.label)).toEqual(["Mean return", "Episode length"]);
    expect(series[0]?.samples).toEqual([-2, 25]);
    expect(series[0]?.min).toBe(-2.2);
  });

  it("says a series is steady when it barely moved, and keeps the curve short", () => {
    const points = Array.from({ length: 200 }, (_, index) => trainPoint(index * 1000, { episode_return: 100 }));
    const [ret] = liveMetrics(status(), points, labels).series;
    expect(ret?.change).toEqual({ text: "steady", tone: "neutral" });
    expect(ret?.samples.length).toBeLessThanOrEqual(48);
  });

  it("breaks the latest reward down by term, the biggest first, penalties in amber and red", () => {
    const points = [
      trainPoint(1000, { reward_terms: { reach_goal: 1 } }),
      trainPoint(2000, { reward_terms: { reach_goal: 2.5, progress: 1, collision: -0.6, energy: -0.05 } }),
    ];
    expect(liveMetrics(status(), points, labels).breakdown).toEqual({
      title: "Reward breakdown · v3",
      terms: [
        { label: "Park in the spot", value: "2.50", ratio: 1, tone: "main" },
        { label: "Get closer", value: "1.00", ratio: 0.4, tone: "minor" },
        { label: "Touching cars", value: "−0.60", ratio: 0.24, tone: "danger" },
        { label: "energy", value: "−0.05", ratio: 0.02, tone: "warn" },
      ],
    });
  });
});
