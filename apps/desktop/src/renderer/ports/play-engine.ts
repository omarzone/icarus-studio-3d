import type { PlayCommand, PlayFrame, PlaySessionInfo } from "@icarus/contracts";
import { type PlayBrainsApi, playBrainsApi } from "../engine-client/play-brains-api.ts";
import { type OpenPlay, openPlay, type PlayConnection } from "../engine-client/play-socket.ts";
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

type Waiter = { resolve: (session: PlaySession) => void; reject: (error: Error) => void };

type Channel = {
  token: object | null;
  connection: PlayConnection | null;
  listener: PlayListener | null;
  info: PlaySessionInfo | null;
  frame: PlayFrame | null;
  live: PlayLive | null;
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

function liveOf(info: PlaySessionInfo | null, frame: PlayFrame | null): PlayLive {
  return {
    scene: info?.scene ?? null,
    poses: new Map(frame?.geoms.map((geom) => [geom.name, { position: geom.position, quaternion: geom.quaternion }])),
    rays: frame?.rays ?? [],
    paused: frame?.paused ?? false,
    speed: frame?.speed ?? 1,
  };
}

export function createEnginePlayPort(open: OpenPlay = openPlay, api: PlayBrainsApi = playBrainsApi): PlayPort {
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
  const publish = (channel: Channel) => {
    const session = sessionOf(channel);
    if (!session || !channel.live) {
      return;
    }
    for (const waiter of channel.waiters.splice(0)) {
      waiter.resolve(session);
    }
    channel.listener?.onUpdate(session, channel.live);
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
      const channel = fresh(previous?.waiters);
      channels.set(project, channel);
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
              channel.live = liveOf(info, channel.frame);
              publish(channel);
            }
          },
          onFrame: (frame) => {
            if (current()) {
              channel.frame = frame;
              channel.controls = { ...channel.controls, speed: frame.speed };
              channel.live = liveOf(channel.info, frame);
              publish(channel);
            }
          },
          onEvent: (event) => {
            if (current()) {
              channel.events = [{ time: eventTime(event.time), text: event.text }, ...channel.events].slice(
                0,
                MAX_EVENTS,
              );
              publish(channel);
            }
          },
          onError: (message) => {
            if (current()) {
              listener.onError(message);
            }
          },
          onClosed: (reason) => {
            if (!current()) {
              return;
            }
            channel.connection = null;
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
        }
      };
    },
  };
}
