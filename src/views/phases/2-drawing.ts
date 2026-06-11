// DRAWING phase — countdown + done tally + canvas pair + Done button.

import PartySocket from "partysocket";
import { el } from "../../dom";
import type { ClientMsg, GmConfigureMsg } from "../../types";
import { buildCanvasPair } from "../../components/pixel-canvas-pair";

export function renderDrawing(
  host: HTMLElement,
  config: GmConfigureMsg,
  socket: PartySocket,
  deadline: number | null,
  registerCleanup: (fn: () => void) => void,
) {
  // ── Status bar ───────────────────────────────────────────────────────────
  const timer = el("p", { class: "drawing__timer" });
  const doneStatus = el("p", {
    class: "drawing__done",
    id: "done-status",
    text: "0 of 0 done",
  });
  const statusBar = el("div", { class: "drawing__status" }, [timer, doneStatus]);

  // ── Canvas pair (target + editable) ──────────────────────────────────────
  const pair = buildCanvasPair({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    variant: "drawing",
  });
  const playerPc = pair.player;

  // ── Done button (committed submission) ───────────────────────────────────
  const doneBtn = el("button", { class: "drawing__done-btn", text: "Done" });

  let submitted = false;
  function submit(reason: "manual" | "deadline") {
    if (submitted) return;
    submitted = true;
    const grid = playerPc.getGrid();
    socket.send(JSON.stringify({ type: "draw:submit", grid } satisfies ClientMsg));
    if (reason === "manual") {
      socket.send(JSON.stringify({ type: "draw:done" } satisfies ClientMsg));
    }
    playerPc.lock();
    doneBtn.disabled = true;
    doneBtn.textContent = reason === "manual" ? "Submitted ✓" : "Time's up — submitted";
  }

  doneBtn.addEventListener("click", () => submit("manual"));

  // ── Timer ────────────────────────────────────────────────────────────────
  // Submit on the local clock; the server's authoritative timer ends DRAWING
  // regardless, and any post-deadline submit gets dropped by the phase guard.
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  if (deadline) {
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      timer.textContent = `Time left: ${left}s`;
      if (left > 0 && !submitted) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const remaining = Math.max(0, deadline - Date.now());
    autoTimer = setTimeout(() => submit("deadline"), remaining);
  } else {
    timer.textContent = "Drawing…";
  }

  // If the page tears down or the phase changes mid-flight, cancel the auto-submit.
  const cancelAuto = () => { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } };
  socket.addEventListener("close", cancelAuto, { once: true });
  registerCleanup(cancelAuto);

  // ── Cmd/Ctrl+Z → undo while drawing ─────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      if (playerPc.isLocked()) return;
      e.preventDefault();
      playerPc.undo();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  registerCleanup(() => window.removeEventListener("keydown", onKeyDown));

  const wrap = el("div", { class: "drawing" }, [
    statusBar,
    pair.element,
    doneBtn,
  ]);

  host.replaceChildren(wrap);
}

export function updateDoneStatus(done: number, total: number) {
  const node = document.getElementById("done-status");
  if (node) node.textContent = `${done} of ${total} done`;
}
