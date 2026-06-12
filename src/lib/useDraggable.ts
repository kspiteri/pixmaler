// Generic pointer-driven drag for floating UI elements.
//
// Returns `x` / `y` refs (panel top-left in viewport coordinates) and a
// `start` handler to attach to the drag *handle*. Skips coarse pointers
// (touch) by default — mobile gets the panel anchored at its default spot
// for now; revisit when the mobile pass lands.
//
// `setPointerCapture` keeps drag events flowing even when the pointer moves
// over other elements (e.g. the canvas underneath), so painting handlers
// don't fight us mid-drag.

import { onBeforeUnmount, ref } from "vue";

export interface UseDraggableOpts {
  // Initial top-left in viewport pixels. Read once on first drag start —
  // updates from outside (resize) come through `setPosition`.
  initialX: number;
  initialY: number;
  // Skip drag wiring on touch devices for now.
  desktopOnly?: boolean;
}

export function useDraggable(opts: UseDraggableOpts) {
  const x = ref(opts.initialX);
  const y = ref(opts.initialY);

  let startClientX = 0;
  let startClientY = 0;
  let originX = 0;
  let originY = 0;
  let activeTarget: HTMLElement | null = null;
  let activePointerId: number | null = null;

  function isCoarsePointer(): boolean {
    return typeof window !== "undefined"
      && window.matchMedia("(pointer: coarse)").matches;
  }

  function start(e: PointerEvent) {
    if (opts.desktopOnly && isCoarsePointer()) return;
    // Only react to the primary button on mouse.
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    activeTarget = target;
    activePointerId = e.pointerId;

    startClientX = e.clientX;
    startClientY = e.clientY;
    originX = x.value;
    originY = y.value;

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  }

  function onMove(e: PointerEvent) {
    x.value = originX + (e.clientX - startClientX);
    y.value = originY + (e.clientY - startClientY);
  }

  function onEnd() {
    if (activeTarget && activePointerId !== null) {
      activeTarget.removeEventListener("pointermove", onMove);
      activeTarget.removeEventListener("pointerup", onEnd);
      activeTarget.removeEventListener("pointercancel", onEnd);
      try { activeTarget.releasePointerCapture(activePointerId); }
      catch { /* already released — fine */ }
    }
    activeTarget = null;
    activePointerId = null;
  }

  function setPosition(nextX: number, nextY: number) {
    x.value = nextX;
    y.value = nextY;
  }

  onBeforeUnmount(onEnd);

  return { x, y, start, setPosition };
}
