// Replay of a recorded rollout: which frame shows at a time, and play, scrub and speed. Pure, so it is tested.

export type PlayerState = { time: number; duration: number; playing: boolean; speed: number };

const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2];

// Index of the last frame recorded at or before `time`; frame times rise.
export function frameAt(times: readonly number[], time: number): number {
  let low = 0;
  let high = times.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((times[middle] ?? 0) <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function startPlayer(duration: number): PlayerState {
  return { time: 0, duration, playing: false, speed: 1 };
}

export function advance(state: PlayerState, seconds: number): PlayerState {
  if (!state.playing) {
    return state;
  }
  const time = state.time + seconds * state.speed;
  return time >= state.duration ? { ...state, time: state.duration, playing: false } : { ...state, time };
}

export function togglePlaying(state: PlayerState): PlayerState {
  if (state.playing) {
    return { ...state, playing: false };
  }
  return { ...state, playing: true, time: state.time >= state.duration ? 0 : state.time };
}

export function scrub(state: PlayerState, share: number): PlayerState {
  return { ...state, time: Math.min(1, Math.max(0, share)) * state.duration };
}

export function nextSpeed(state: PlayerState): PlayerState {
  const index = SPEEDS.indexOf(state.speed);
  return { ...state, speed: SPEEDS[(index + 1) % SPEEDS.length] ?? 1 };
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

// What the playback bar shows for the current state.
export function playerAt(state: PlayerState): { played: number; at: string; length: string; speed: string } {
  return {
    played: state.duration > 0 ? state.time / state.duration : 0,
    at: clock(state.time),
    length: clock(state.duration),
    speed: `${state.speed}×`,
  };
}
