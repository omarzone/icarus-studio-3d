import type { PlayCommand, PlayFrame, PlaySessionInfo, SceneSignals } from "@icarus/contracts";
import { type PlayBrainsApi, playBrainsApi } from "../engine-client/play-brains-api.ts";
import { type OpenPlay, openPlay, type PlayConnection } from "../engine-client/play-socket.ts";
import { type LiveBrains, liveBrains } from "./live-brain.ts";
import {
  actsAtOnce,
  type PlayEvent,
  type PlayListener,
  type PlayLive,
  type PlayPort,
  type PlaySession,
  type PlayToolId,
} from "./play-port.ts";
import {
  controlsAfter,
  eventTime,
  formatSpeed,
  type PlayControls,
  parseSpeed,
  playBrains,
  playCommand,
  playSession,
  playTools,
} from "./play-views.ts";

// Play on the engine: one live session per project over the Play WebSocket, mapped onto the Play view types.

const MAX_EVENTS = 50;

// The panels (readings, decisions, events, status) follow the session at most this often; the 3D poses go every paint.
const PANEL_INTERVAL_MS = 100;

// How long a publish waits for a paint before going anyway: hidden windows pause animation frames.
const PAINT_FALLBACK_MS = 100;

// When publishes run: `nextPaint` runs one before the next paint, however many messages arrived since the last.
export type PlayPacing = { nextPaint: (publish: () => void) => void; now: () => number };

// A function, not a constant: play-port.ts creates the port while this module is still loading.
function browserPacing(): PlayPacing {
  return {
    nextPaint: (publish) => {
      let done = false;
      const once = () => {
        if (!done) {
          done = true;
          publish();
        }
      };
      requestAnimationFrame(once);
      setTimeout(once, PAINT_FALLBACK_MS);
    },
    now: () => performance.now(),
  };
}

type Waiter = { resolve: (session: PlaySession) => void; reject: (error: Error) => void };

type Channel = {
  token: object | null;
  connection: PlayConnection | null;
  listener: PlayListener | null;
  info: PlaySessionInfo | null;
  frame: PlayFrame | null;
  live: PlayLive | null;
  // The session the listener last got, rebuilt when the panels are due; the live world is rebuilt every publish.
  session: PlaySession | null;
  sessionAt: number;
  panelsStale: boolean;
  liveStale: boolean;
  scheduled: boolean;
  events: PlayEvent[];
  selected: PlayToolId | null;
  controls: PlayControls;
  failure: Error | null;
  waiters: Waiter[];
};

const fresh = (waiters: Waiter[] = []): Channel => ({
  token: null,
  connection: null,
  listener: null,
  info: null,
  frame: null,
  live: null,
  session: null,
  sessionAt: 0,
  panelsStale: false,
  liveStale: false,
  scheduled: false,
  events: [],
  selected: null,
  controls: { speed: 1, light: 1, wind: false },
  failure: null,
  waiters,
});

function sessionOf(channel: Channel): PlaySession | null {
  const { info, frame } = channel;
  if (!info || !frame) {
    return null;
  }
  const tools = playTools(info.tools);
  const selectedTool = channel.selected ?? tools.find((tool) => !actsAtOnce(tool.id))?.id ?? "move";
  return playSession({ info, frame, events: channel.events, selectedTool });
}

// The previous signals when the engine measured the same again, so the scene keeps what it built from them.
function steadySignals(previous: SceneSignals | null | undefined, next: SceneSignals | null): SceneSignals | null {
  return previous !== undefined && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

function liveOf(info: PlaySessionInfo | null, frame: PlayFrame | null, previous: PlayLive | null): PlayLive {
  return {
    scene: info?.scene ?? null,
    poses: new Map(frame?.geoms.map((geom) => [geom.name, { position: geom.position, quaternion: geom.quaternion }])),
    rays: frame?.rays ?? [],
    signals: steadySignals(previous?.signals, frame?.signals ?? null),
    paused: frame?.paused ?? false,
    speed: frame?.speed ?? 1,
  };
}

export function createEnginePlayPort(
  open: OpenPlay = openPlay,
  api: PlayBrainsApi = playBrainsApi,
  pacing: PlayPacing = browserPacing(),
  brains: LiveBrains = liveBrains,
): PlayPort {
  const channels = new Map<string, Channel>();
  const channelOf = (project: string): Channel => {
    const existing = channels.get(project);
    if (existing) {
      return existing;
    }
    const created = fresh();
    channels.set(project, created);
    return created;
  };
  // Throttled panels catch up on a later frame: the engine sends one every 1/30 s, paused or not.
  const publish = (channel: Channel) => {
    if (channel.token === null) {
      return;
    }
    const now = pacing.now();
    if (channel.panelsStale && (channel.session === null || now - channel.sessionAt >= PANEL_INTERVAL_MS)) {
      channel.session = sessionOf(channel);
      channel.sessionAt = now;
      channel.panelsStale = channel.session === null;
    }
    if (channel.liveStale) {
      channel.live = liveOf(channel.info, channel.frame, channel.live);
      channel.liveStale = false;
    }
    const { session, live } = channel;
    if (!session || !live) {
      return;
    }
    for (const waiter of channel.waiters.splice(0)) {
      waiter.resolve(session);
    }
    channel.listener?.onUpdate(session, live);
  };
  const schedule = (channel: Channel) => {
    if (channel.scheduled) {
      return;
    }
    channel.scheduled = true;
    pacing.nextPaint(() => {
      channel.scheduled = false;
      publish(channel);
    });
  };
  // What changed reaches the panels on the next publish, without waiting for their interval.
  const refreshPanels = (channel: Channel) => {
    channel.session = null;
    channel.panelsStale = true;
  };
  const running = (project: string): { channel: Channel; connection: PlayConnection; session: PlaySession } => {
    const channel = channelOf(project);
    const session = sessionOf(channel);
    if (!channel.connection || !session) {
      throw new Error("Play is not running");
    }
    return { channel, connection: channel.connection, session };
  };
  const command = (project: string, next: PlayCommand) => {
    const { channel, connection } = running(project);
    connection.send(next);
    channel.controls = controlsAfter(channel.controls, next);
    return channel;
  };

  return {
    getSession: (project) => {
      const channel = channelOf(project);
      const session = sessionOf(channel);
      if (session) {
        return Promise.resolve(session);
      }
      if (channel.failure) {
        return Promise.reject(channel.failure);
      }
      return new Promise((resolve, reject) => channel.waiters.push({ resolve, reject }));
    },
    selectTool: async ({ project, tool }) => {
      const { channel } = running(project);
      if (!actsAtOnce(tool)) {
        channel.selected = tool;
        refreshPanels(channel);
      }
      return running(project).session;
    },
    setSpeed: async ({ project, speed }) => {
      const channel = command(project, { tool: "speed", speed: parseSpeed(speed) });
      return { ...running(project).session, speed: formatSpeed(channel.controls.speed) };
    },
    send: async ({ project, action }) => {
      command(project, playCommand(action, running(project).channel.controls));
    },
    brains: async (project) => playBrains(await api.playBrains(project)),
    connect: (project, listener, brain) => {
      const previous = channels.get(project);
      previous?.connection?.close();
      if (previous) {
        previous.token = null;
      }
      const channel = fresh(previous?.waiters);
      channels.set(project, channel);
      brains.clear(project);
      const token = {};
      channel.token = token;
      channel.listener = listener;
      const current = () => channel.token === token;
      channel.connection = open(
        project,
        {
          onReady: (info) => {
            if (current()) {
              channel.info = info;
              channel.liveStale = true;
              refreshPanels(channel);
              schedule(channel);
            }
          },
          onFrame: (frame) => {
            if (current()) {
              channel.frame = frame;
              channel.controls = { ...channel.controls, speed: frame.speed };
              channel.liveStale = true;
              channel.panelsStale = true;
              schedule(channel);
            }
          },
          onActivity: (activity) => {
            const { info, frame } = channel;
            if (current() && info?.run_id && typeof info.step === "number" && frame) {
              brains.publish(project, {
                runId: info.run_id,
                step: info.step,
                brain: info.brain,
                activity,
                senses: frame.senses,
                actions: frame.actions,
              });
            }
          },
          onEvent: (event) => {
            if (current()) {
              channel.events = [{ time: eventTime(event.time), text: event.text }, ...channel.events].slice(
                0,
                MAX_EVENTS,
              );
              channel.panelsStale = true;
              schedule(channel);
            }
          },
          onError: (message) => {
            if (current()) {
              listener.onError(message);
            }
          },
          onProgress: (stage) => {
            if (current()) {
              listener.onProgress?.(stage);
            }
          },
          onClosed: (reason) => {
            if (!current()) {
              return;
            }
            channel.connection = null;
            brains.clear(project);
            if (!sessionOf(channel)) {
              channel.failure = new Error(reason);
              for (const waiter of channel.waiters.splice(0)) {
                waiter.reject(channel.failure);
              }
            }
            listener.onClosed(reason);
          },
        },
        { brain },
      );
      return () => {
        if (current()) {
          channel.token = null;
          channel.connection?.close();
          channels.set(project, fresh());
          brains.clear(project);
        }
      };
    },
  };
}
