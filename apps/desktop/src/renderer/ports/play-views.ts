import type { PlayCommand, PlayFrame, PlayReading, PlaySessionInfo, PlayToolInfo } from "@icarus/contracts";
import {
  type LiveBar,
  PLACED_PIECE,
  type PlayAction,
  type PlayEvent,
  type PlaySession,
  type PlayTool,
  type PlayToolId,
} from "./play-port.ts";

// Pure mappings between the Play contract and the Play view types.

const SLOW_SPEED = 0.25;
// Speed one push gives an object in m/s (the engine sizes the impulse by its mass), and the wind the Wind tool turns on in m/s.
const PUSH_SPEED = 1.5;
const WIND_SPEED = 4;
// Light scales the Light tool cycles through: as designed, dim, bright.
const LIGHT_LEVELS: readonly number[] = [1, 0.3, 2.5];

export function formatValue(value: number): string {
  const size = Math.abs(value);
  const rounded = Number(value.toFixed(size >= 10 ? 0 : size >= 1 ? 1 : 2));
  return String(rounded === 0 ? 0 : rounded);
}

function ratio(reading: PlayReading): number {
  const span = reading.max - reading.min;
  const share = span > 0 ? (reading.value - reading.min) / span : 0;
  return Math.round(Math.min(1, Math.max(0, share)) * 1000) / 1000;
}

function bar(reading: PlayReading, tone: LiveBar["tone"]): LiveBar {
  const value = formatValue(reading.value);
  return {
    id: reading.id,
    label: reading.label,
    ratio: ratio(reading),
    display: reading.unit ? `${value} ${reading.unit}` : value,
    tone,
  };
}

// Distances (rays, in metres) warn when something is closer than a fifth of their range.
export function senseBars(readings: readonly PlayReading[]): LiveBar[] {
  return readings.map((reading) => bar(reading, reading.unit === "m" && ratio(reading) < 0.2 ? "warn" : "default"));
}

export function decisionBars(readings: readonly PlayReading[]): LiveBar[] {
  return readings.map((reading) => bar(reading, "default"));
}

export function eventTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

export function parseSpeed(label: string): number {
  const speed = Number.parseFloat(label);
  return Number.isFinite(speed) ? Math.min(4, Math.max(0.1, speed)) : 1;
}

const TOOL_IDS: Readonly<Record<string, PlayToolId>> = {
  move: "move",
  push: "push",
  "add-object": "add-object",
  add_object: "add-object",
  light: "light",
  wind: "wind",
  slow: "slow",
  speed: "slow",
  reset: "reset",
  shuffle: "shuffle",
  touch: "touch",
};

export function playTools(tools: readonly PlayToolInfo[]): PlayTool[] {
  return tools.flatMap((tool) => {
    const id = TOOL_IDS[tool.id];
    return id ? [{ id, label: tool.label }] : [];
  });
}

type SessionParts = {
  info: PlaySessionInfo;
  frame: PlayFrame;
  events: readonly PlayEvent[];
  selectedTool: PlayToolId;
};

export function playSession({ info, frame, events, selectedTool }: SessionParts): PlaySession {
  return {
    // Bodies in library v1 have no cameras, so the only view is the game view.
    views: ["Game view"],
    tools: playTools(info.tools),
    selectedTool,
    speed: formatSpeed(frame.speed),
    paused: frame.paused,
    status: { title: frame.status.title, detail: frame.status.detail },
    placing: selectedTool === "add-object" ? `Click to place: ${PLACED_PIECE.label}` : undefined,
    senses: {
      bars: senseBars(frame.senses),
      note: `Reward ${formatValue(frame.reward)} · episode return ${formatValue(frame.episode_return)}`,
    },
    decisions: { bars: decisionBars(frame.actions), brain: info.brain },
    events,
  };
}

// The world settings the toggling tools change; the next command depends on them.
export type PlayControls = { speed: number; light: number; wind: boolean };

export function playCommand(action: PlayAction, controls: PlayControls): PlayCommand {
  switch (action.tool) {
    case "move":
      return { tool: "move", object: action.object, position: action.to };
    case "push":
      return { tool: "push", object: action.object, direction: action.direction, speed: PUSH_SPEED };
    case "add-object":
      return { tool: "add_object", piece: action.piece, position: action.at };
    case "touch":
      return { tool: "touch", object: action.object };
    case "light": {
      const next = LIGHT_LEVELS[(LIGHT_LEVELS.indexOf(controls.light) + 1) % LIGHT_LEVELS.length];
      return { tool: "light", intensity: next ?? 1 };
    }
    case "wind":
      return { tool: "wind", velocity: controls.wind ? [0, 0, 0] : [WIND_SPEED, 0, 0] };
    case "slow":
      return { tool: "speed", speed: controls.speed === SLOW_SPEED ? 1 : SLOW_SPEED };
    case "reset":
      return { tool: "reset" };
    case "shuffle":
      return { tool: "shuffle" };
    case "pause":
      return { tool: "pause", paused: action.paused };
  }
}

export function controlsAfter(controls: PlayControls, command: PlayCommand): PlayControls {
  switch (command.tool) {
    case "speed":
      return { ...controls, speed: command.speed };
    case "light":
      return { ...controls, light: command.intensity };
    case "wind":
      return { ...controls, wind: command.velocity.some((value) => value !== 0) };
    case "move":
    case "push":
    case "add_object":
    case "pause":
    case "reset":
    case "shuffle":
    case "touch":
      return controls;
  }
}
