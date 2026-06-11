// Image picker — shared by GM controls and the /paint sandbox.
// Renders the scale/colour/upload/sample controls and runs the pipeline on
// change, calling `onResult` with the processed grid+palette.

import { el } from "../dom";
import {
  DEFAULT_COLOR_COUNT,
  DEFAULT_SCALE,
  isMobileWarning,
  type PipelineResult,
  processImage,
} from "../pipeline";
import { PixelCanvas } from "../canvas";

export interface ImagePickerOpts {
  onResult: (result: PipelineResult) => void;
  // Fires when the input changes but before processing finishes — caller can
  // use this to disable a Start button etc.
  onProcessing?: () => void;
  showMobileWarn?: boolean;
  showDrawSeconds?: boolean;
  showPreview?: boolean;
  // Auto-load a sample on first render. Useful for the sandbox where an image
  // is required.
  autoLoadSample?: "monalisa" | "scream" | "pearls";
}

export interface ImagePickerHandle {
  element: HTMLElement;
  getDrawSeconds: () => number;
}

export function buildImagePicker(opts: ImagePickerOpts): ImagePickerHandle {
  // ── Controls ───────────────────────────────────────────────────────────────

  const scaleInput = el("input", {
    class: "picker__scale-input",
    type: "range", min: "1", max: "50", value: String(DEFAULT_SCALE),
  });
  const scaleVal = el("span", { class: "picker__scale-val", text: String(DEFAULT_SCALE) });
  const scaleLabel = el("label", {}, ["Scale: ", scaleInput, scaleVal]);

  const colorCount = el("input", {
    class: "picker__count-input",
    type: "number", value: String(DEFAULT_COLOR_COUNT), min: "4", max: "32",
  });
  const colorLabel = el("label", {}, [" Colors: ", colorCount]);

  const drawSecs = el("input", {
    class: "picker__time-input",
    type: "number", value: "120", min: "30", max: "600",
  });
  const timeLabel = el("label", {}, [" Draw seconds: ", drawSecs]);

  const fileInput = el("input", { type: "file", accept: "image/*" });
  const uploadLabel = el("label", {}, ["Upload image: ", fileInput]);

  const mobileWarn = el("p", { class: "picker__warn" });
  mobileWarn.style.display = "none";
  mobileWarn.textContent = "⚠ Grid exceeds 64px on its longest side — mobile players may struggle.";

  const preview = el("div", { class: "picker__preview" });
  const status = el("p", { class: "picker__status" });

  // ── Processing ─────────────────────────────────────────────────────────────

  let cachedFile: File | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let runId = 0;

  async function reprocess() {
    if (!cachedFile) return;
    const myRun = ++runId;
    const scale = parseInt(scaleInput.value) || DEFAULT_SCALE;
    const count = parseInt(colorCount.value) || DEFAULT_COLOR_COUNT;

    status.textContent = "Processing…";
    if (opts.showPreview) preview.textContent = "";
    mobileWarn.style.display = "none";
    opts.onProcessing?.();

    try {
      const result = await processImage(cachedFile, scale, count);
      if (myRun !== runId) return; // stale

      status.textContent = "";
      if (opts.showMobileWarn) {
        mobileWarn.style.display = isMobileWarning(Math.max(result.gridW, result.gridH)) ? "block" : "none";
      }

      if (opts.showPreview) {
        preview.replaceChildren();
        const label = el("p", { text: `Target image (${result.gridW}×${result.gridH}):` });
        const pc = new PixelCanvas({
          gridW: result.gridW,
          gridH: result.gridH,
          palette: result.palette,
          targetGrid: result.targetGrid,
          editable: false,
        });
        preview.append(label, pc.canvas);
      }

      opts.onResult(result);
    } catch (err) {
      if (myRun !== runId) return;
      status.textContent = `Error: ${err}`;
    }
  }

  function scheduleReprocess() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reprocess, 150);
  }

  scaleInput.addEventListener("input", () => {
    scaleVal.textContent = scaleInput.value;
    scheduleReprocess();
  });
  colorCount.addEventListener("input", scheduleReprocess);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    cachedFile = file;
    reprocess();
  });

  // ── Sample images ──────────────────────────────────────────────────────────

  const samples = ["monalisa", "scream", "pearls"] as const;
  const samplesWrap = el("div", { class: "picker__samples" }, [
    el("span", { text: "Or try a sample:" }),
  ]);

  async function loadSample(name: typeof samples[number]) {
    try {
      const url = `${import.meta.env.BASE_URL}assets/${name}.png`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      cachedFile = new File([blob], `${name}.png`, { type: blob.type || "image/png" });
      fileInput.value = "";
      reprocess();
    } catch (err) {
      status.textContent = `Could not load sample "${name}": ${err}`;
    }
  }

  for (const name of samples) {
    const btn = el("button", { type: "button", text: name });
    btn.addEventListener("click", () => loadSample(name));
    samplesWrap.appendChild(btn);
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  const children: (HTMLElement | Node)[] = [
    scaleLabel,
    el("br"),
    colorLabel,
  ];
  if (opts.showDrawSeconds) children.push(timeLabel);
  children.push(el("br"), el("br"), uploadLabel, samplesWrap);
  if (opts.showMobileWarn) children.push(mobileWarn);
  children.push(status);
  if (opts.showPreview) children.push(preview);

  const section = el("div", { class: "picker" }, children);

  if (opts.autoLoadSample) loadSample(opts.autoLoadSample);

  return {
    element: section,
    getDrawSeconds: () => parseInt(drawSecs.value) || 120,
  };
}
