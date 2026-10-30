import { tokens } from "@icarus/ui-tokens";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

const TRAFFIC_LIGHTS_X = 18;
const TRAFFIC_LIGHTS_SIZE = 14;

type FrameWindow = Pick<BrowserWindow, "setTitleBarOverlay" | "setWindowButtonPosition">;

export function windowFrame(platform: NodeJS.Platform, height: number): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    return { titleBarStyle: "hidden", trafficLightPosition: trafficLights(height) };
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color: tokens.color.bg.app, symbolColor: tokens.color.fg.tool, height },
  };
}

export function resizeTitleBar(win: FrameWindow, platform: NodeJS.Platform, height: number): void {
  if (platform === "darwin") {
    win.setWindowButtonPosition(trafficLights(height));
    return;
  }
  win.setTitleBarOverlay({ height });
}

export function isTitleBarHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 24 && value <= 96;
}

function trafficLights(height: number): { x: number; y: number } {
  return { x: TRAFFIC_LIGHTS_X, y: Math.round((height - TRAFFIC_LIGHTS_SIZE) / 2) };
}
