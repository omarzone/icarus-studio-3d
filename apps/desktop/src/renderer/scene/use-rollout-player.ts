import { useEffect, useState } from "react";
import { advance, type PlayerState, startPlayer, togglePlaying } from "./rollout-player.ts";

// Moves a replay's player with the screen's frames while it plays.
export function useRolloutPlayer(duration: number, autoplay: boolean) {
  const [player, setPlayer] = useState<PlayerState>(() =>
    autoplay ? togglePlaying(startPlayer(duration)) : startPlayer(duration),
  );
  useEffect(() => {
    if (!player.playing) {
      return;
    }
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // Measured before the update: React may run the updater after `last` has moved on.
      const seconds = Math.max(0, now - last) / 1000;
      setPlayer((state) => advance(state, seconds));
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [player.playing]);
  return [player, setPlayer] as const;
}
