// Pixel canvas pair — target reference + editable canvas + swatch + brush + undo.
// Shared by the DRAWING phase and the /paint sandbox; both screens render the
// same layout with slightly different sizing (controlled via the `variant` opt).

import { el } from "../dom";
import { buildBrushControls, buildSwatch, PixelCanvas, type SwatchHandle } from "../canvas";

export interface CanvasPairOpts {
  gridW: number;
  gridH: number;
  palette: string[];
  targetGrid: number[];
  // "drawing" → wider editable canvas, no Clear button (committed strokes only).
  // "paint"   → narrower target reference, Clear button included (sandbox toy).
  variant: "drawing" | "paint";
}

export interface CanvasPairHandle {
  element: HTMLElement;
  // The editable PixelCanvas. Phase view needs this to call lock(), getGrid(),
  // isLocked(), undo() etc.
  player: PixelCanvas;
  swatch: SwatchHandle;
  // Pre-built UI nodes the caller can place elsewhere if needed (not used yet).
  undoBtn: HTMLButtonElement;
}

export function buildCanvasPair(opts: CanvasPairOpts): CanvasPairHandle {
  const { gridW, gridH, palette, targetGrid, variant } = opts;

  // Build the swatch first so the canvases' onHover handlers can highlight it.
  // `player` is referenced in the swatch's onSelect, but that fires on click,
  // by which time `player` will be defined.
  let player: PixelCanvas;
  const swatch = buildSwatch(palette, i => player.selectColor(i));

  // ── Target (read-only reference) ─────────────────────────────────────────
  const target = new PixelCanvas({
    gridW, gridH, palette, targetGrid,
    editable: false,
    onHover: cell => swatch.highlight(cell ? targetGrid[cell.y * gridW + cell.x] : null),
  });
  target.canvas.classList.add("canvas-pair__target-canvas");
  // PixelCanvas defaults editable canvases to a soft `#ccc` border; here we
  // want the darker `#444` to match the original drawing-phase look. Applied
  // inline because the constructor itself sets the border inline (higher
  // specificity than any class).
  target.canvas.style.border = "1px solid #444";

  const targetLabel = el("p", { text: variant === "paint" ? "Reference" : "Target" });
  const targetWrap = el("div", { class: "canvas-pair__target" }, [targetLabel, target.canvas]);

  // ── Editable canvas ──────────────────────────────────────────────────────
  player = new PixelCanvas({
    gridW, gridH, palette,
    editable: true,
    onHover: cell => {
      target.showMarker(cell);
      swatch.highlight(cell ? targetGrid[cell.y * gridW + cell.x] : null);
    },
  });
  player.canvas.classList.add("canvas-pair__draw-canvas");
  player.canvas.style.border = "1px solid #444";

  const drawLabel = el("p", { text: variant === "paint" ? "Your canvas" : "Your drawing" });
  const drawWrap = el("div", { class: "canvas-pair__draw" }, [drawLabel, player.canvas]);

  const row = el("div", { class: "canvas-pair__row" }, [targetWrap, drawWrap]);

  // ── Tools ────────────────────────────────────────────────────────────────
  const brush = buildBrushControls(player);
  brush.classList.add("canvas-pair__brush");

  const undoBtn = el("button", { type: "button", text: "Undo" });
  undoBtn.addEventListener("click", () => player.undo());

  const btns = el("div", { class: "canvas-pair__btns btn-row" }, [undoBtn]);

  if (variant === "paint") {
    const clearBtn = el("button", { type: "button", text: "Clear" });
    clearBtn.addEventListener("click", () => {
      player.pushUndoSnapshot();
      player.setGrid(new Array(gridW * gridH).fill(-1));
    });
    btns.appendChild(clearBtn);
  }

  const tools = el("div", { class: "canvas-pair__tools" }, [
    swatch.element,
    brush,
    btns,
  ]);

  const wrap = el("div", { class: `canvas-pair canvas-pair--${variant}` }, [row, tools]);

  return { element: wrap, player, swatch, undoBtn };
}
