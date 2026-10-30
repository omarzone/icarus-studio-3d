export type WindowBridge = {
  platform: string;
  setTitleBarHeight(height: number): void;
};

export const WINDOW_CHANNEL = { titleBarHeight: "window:title-bar-height" } as const;
