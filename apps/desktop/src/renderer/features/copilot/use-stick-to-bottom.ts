import { type RefObject, useLayoutEffect, useRef } from "react";

// How close to the end still counts as reading the latest messages.
const NEAR_END_PX = 48;

// Keeps a scrolling list at its newest message while the person is there, without pulling them back from history.
// `follow` forces the jump (the person just sent a message).
export function useStickToBottom(list: RefObject<HTMLElement | null>, change: unknown, follow: boolean) {
  const atEnd = useRef(true);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) {
      return;
    }
    const onScroll = () => {
      atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_END_PX;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    // Pictures that finish loading make the list taller; stay at the end if the person was there.
    const resize = new ResizeObserver(() => {
      if (atEnd.current) {
        element.scrollTop = element.scrollHeight;
      }
    });
    for (const child of element.children) {
      resize.observe(child);
    }
    return () => {
      element.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [list]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `change` is the signal to run, not a value read here.
  useLayoutEffect(() => {
    const element = list.current;
    if (element && (follow || atEnd.current)) {
      element.scrollTop = element.scrollHeight;
      atEnd.current = true;
    }
  }, [list, change, follow]);
}
