// Paint sandbox — solo canvas, picker on the left, target+editable on the right.
// No lobby, no socket, no timer. Just the same pipeline + canvas pair.

import { el } from "../dom";
import { buildImagePicker } from "../components/image-picker";
import { buildCanvasPair } from "../components/pixel-canvas-pair";
import type { PixelCanvas } from "../canvas";

export function renderPaintSandbox(host: HTMLElement) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const backLink = el("a", {
    class: "paint__back",
    href: `${base}/`,
    text: "← Back to lobby entry",
  });

  // Right-hand pane is replaced wholesale each time the picker fires `onResult`,
  // so the canvas pair tears down its old PixelCanvas instances.
  const right = el("div", { class: "paint__right" });
  let currentPc: PixelCanvas | null = null;

  // Cmd/Ctrl+Z → undo on whichever canvas is active in the sandbox.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      currentPc?.undo();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  // No view cleanup hook here — the sandbox owns its keydown for its lifetime,
  // and unloading the page is the only way out.

  const picker = buildImagePicker({
    autoLoadSample: "monalisa",
    showMobileWarn: false,
    showDrawSeconds: false,
    showPreview: false,
    onResult: (result) => {
      const pair = buildCanvasPair({
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        variant: "paint",
      });
      currentPc = pair.player;
      right.replaceChildren(pair.element);
    },
  });

  const left = el("div", { class: "paint__left" }, [picker.element]);
  const row = el("div", { class: "paint__row" }, [left, right]);

  const wrap = el("div", { class: "page paint" }, [
    backLink,
    el("h1", { text: "Paint sandbox" }),
    el("p", { class: "muted", text: "Solo canvas — pick an image, then paint. No lobby, no timer." }),
    row,
  ]);

  host.replaceChildren(wrap);
}
