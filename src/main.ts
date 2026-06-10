import PartySocket from "partysocket";
import { uniqueNamesGenerator } from "unique-names-generator";
import { adjectives, nouns } from "./words";
import type { ServerMsg, ClientMsg, GmConfigureMsg } from "./types";
import {
  processImage,
  isMobileWarning,
  DEFAULT_COLOR_COUNT,
  DEFAULT_SCALE,
} from "./pipeline";
import { PixelCanvas, buildSwatch, buildBrushControls } from "./canvas";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "127.0.0.1:1999";

function getOrCreateClientId(): string {
  let id = localStorage.getItem("pixmaler:clientId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pixmaler:clientId", id);
  }
  return id;
}

function getOrCreateName(): string {
  return localStorage.getItem("pixmaler:name") ?? "";
}

function generateRoomCode(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, nouns],
    separator: "-",
    length: 2,
    style: "lowerCase",
  });
}

function getRoomFromUrl(): string | null {
  return new URLSearchParams(location.search).get("room");
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const app = document.getElementById("app")!;
const roomCode = getRoomFromUrl();

if (!roomCode) {
  renderEntry();
} else {
  connectToRoom(roomCode);
}

// ── Entry screen ──────────────────────────────────────────────────────────────

function renderEntry() {
  app.innerHTML = "";
  const wrap = el("div", "font-family:monospace;padding:2rem;max-width:420px");

  const h1 = el("h1"); h1.textContent = "Pixmaler";
  const sub = el("p"); sub.innerHTML = "pixel + <em>maler</em> (Norwegian: painter)";

  const nameLabel = el("label"); nameLabel.textContent = "Your name";
  const nameInput = el("input") as HTMLInputElement;
  nameInput.type = "text"; nameInput.placeholder = "e.g. Keith";
  nameInput.value = getOrCreateName();
  nameInput.style.cssText = "display:block;margin-top:4px;font-family:monospace";
  nameLabel.appendChild(nameInput);

  const createBtn = el("button"); createBtn.textContent = "Create room (GM)";
  createBtn.style.marginTop = "12px";

  const hr = document.createElement("hr");

  const codeLabel = el("label"); codeLabel.textContent = "Room code";
  const codeInput = el("input") as HTMLInputElement;
  codeInput.type = "text"; codeInput.placeholder = "e.g. feral-crayon";
  codeInput.style.cssText = "display:block;margin-top:4px;font-family:monospace";
  codeLabel.appendChild(codeInput);

  const joinBtn = el("button"); joinBtn.textContent = "Join room";
  joinBtn.style.marginTop = "12px";

  createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) { alert("Enter your name first."); return; }
    localStorage.setItem("pixmaler:name", name);
    location.href = `${location.pathname}?room=${generateRoomCode()}`;
  });

  joinBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toLowerCase();
    if (!name) { alert("Enter your name first."); return; }
    if (!code) { alert("Enter a room code."); return; }
    localStorage.setItem("pixmaler:name", name);
    location.href = `${location.pathname}?room=${code}`;
  });

  wrap.append(h1, sub, nameLabel, createBtn, hr, codeLabel, joinBtn);
  app.appendChild(wrap);
}

// ── Room connection ───────────────────────────────────────────────────────────

function connectToRoom(roomCode: string) {
  const clientId = getOrCreateClientId();
  const name = getOrCreateName() || clientId.slice(0, 6);

  const status = el("p"); status.textContent = `Connecting to ${roomCode}…`;
  const wrap = el("div", "font-family:monospace;padding:2rem");
  wrap.appendChild(status);
  app.replaceChildren(wrap);

  const socket = new PartySocket({ host: PARTYKIT_HOST, room: roomCode });

  socket.addEventListener("open", () => {
    const msg: ClientMsg = { type: "join", clientId, name };
    socket.send(JSON.stringify(msg));
  });

  socket.addEventListener("message", (ev) => {
    let msg: ServerMsg;
    try { msg = JSON.parse(ev.data as string) as ServerMsg; }
    catch { console.error("[pixmaler] bad message", ev.data); return; }

    handleServerMsg(msg, socket, clientId);
  });

  socket.addEventListener("close", () => {
    console.warn("[pixmaler] socket closed");
  });
}

// ── Server message dispatch ───────────────────────────────────────────────────

// Last-seen state from the server. We render off this snapshot rather than
// passing args through every dispatch path; reconnects and `phase`-only
// messages rely on it being kept up to date.
let lastState: Extract<ServerMsg, { type: "state" }> | null = null;
let renderedPhase: string | null = null;
let renderedGmClientId: string | null = null;

function handleServerMsg(msg: ServerMsg, socket: PartySocket, clientId: string) {
  switch (msg.type) {
    case "state": {
      const prevConfig = lastState?.config ?? null;
      lastState = msg;
      const phaseChanged = msg.phase !== renderedPhase;
      // Re-render the lobby on GM changes too — when an auto-promote happens
      // or the original GM reconnects, the new GM needs the start UI and the
      // demoted player needs it gone.
      const gmChanged = msg.phase === "LOBBY" && msg.gmClientId !== renderedGmClientId;
      if (phaseChanged || gmChanged) {
        renderedPhase = msg.phase;
        renderedGmClientId = msg.gmClientId;
        renderForPhase(socket, clientId);
      } else if (msg.phase === "LOBBY") {
        // In-place update so the GM controls don't get torn down on every join.
        updatePlayerList(msg, socket, clientId);
        // Also patch the target preview for non-GM viewers when the GM picks
        // or changes the image. (For the GM, the preview lives inside their
        // controls panel and is updated there.)
        if (msg.gmClientId !== clientId && msg.config !== prevConfig) {
          updateLobbyTargetPreview(msg.config);
        }
      }
      break;
    }
    case "phase": {
      // `phase` doesn't carry config/players — patch what it does carry into
      // the cached state and re-render.
      if (lastState) {
        lastState = { ...lastState, phase: msg.phase, deadline: msg.deadline };
      }
      renderedPhase = msg.phase;
      renderForPhase(socket, clientId);
      break;
    }
    case "done-status": {
      updateDoneStatus(msg.doneCount, msg.totalDrawing);
      break;
    }
    case "gallery": {
      // Stash on the cached state so VOTING render can read it.
      cachedGallery = msg;
      break;
    }
    case "results": {
      cachedResults = msg;
      break;
    }
    case "error": {
      console.warn("[pixmaler] server error:", msg.message);
      alert(msg.message);
      break;
    }
  }
}

let cachedGallery: Extract<ServerMsg, { type: "gallery" }> | null = null;
let cachedResults: Extract<ServerMsg, { type: "results" }> | null = null;

function renderForPhase(socket: PartySocket, clientId: string) {
  if (!lastState) return;
  switch (lastState.phase) {
    case "LOBBY":
      renderLobby(lastState, socket, clientId);
      break;
    case "DRAWING":
      if (lastState.config) {
        renderDrawing(lastState.config, socket, clientId, lastState.deadline);
      }
      break;
    case "VOTING":
      renderVoting(socket, clientId);
      break;
    case "RESULTS":
      renderResults(socket, clientId);
      break;
  }
}

// Updated by `done-status` messages while DRAWING is on screen.
function updateDoneStatus(done: number, total: number) {
  const el = document.getElementById("done-status");
  if (el) el.textContent = `${done} of ${total} done`;
}

// Build a single `<li>` for the player list, with an optional "Make GM" button
// when the viewer is the current GM and the row is for a connected non-self.
function buildPlayerLi(
  p: Extract<ServerMsg, { type: "state" }>["players"][number],
  viewerClientId: string,
  viewerIsGm: boolean,
  socket: PartySocket,
): HTMLLIElement {
  const li = document.createElement("li");
  const label = `${p.name}${p.isGm ? " (GM)" : ""}${p.connected ? "" : " [offline]"}`;
  li.textContent = label;

  if (viewerIsGm && p.connected && p.clientId !== viewerClientId && !p.isGm) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Make GM";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", () => {
      if (!confirm(`Transfer GM to ${p.name}?`)) return;
      socket.send(JSON.stringify({ type: "gm:transfer", toClientId: p.clientId } satisfies ClientMsg));
    });
    li.appendChild(btn);
  }
  return li;
}

function updatePlayerList(
  state: Extract<ServerMsg, { type: "state" }>,
  socket: PartySocket,
  viewerClientId: string,
) {
  const list = document.getElementById("player-list");
  if (!list) return;
  const viewerIsGm = state.gmClientId === viewerClientId;
  list.innerHTML = "";
  for (const p of state.players) {
    list.appendChild(buildPlayerLi(p, viewerClientId, viewerIsGm, socket));
  }
}

// ── Lobby screen ──────────────────────────────────────────────────────────────

function renderLobby(
  state: Extract<ServerMsg, { type: "state" }>,
  socket: PartySocket,
  clientId: string,
) {
  const isGm = state.gmClientId === clientId;
  const roomCode = new URLSearchParams(location.search).get("room") ?? "";

  app.innerHTML = "";
  const wrap = el("div", "font-family:monospace;padding:2rem;max-width:600px");

  const h2 = el("h2"); h2.textContent = `Room: ${roomCode}`;
  const playerList = el("ul"); playerList.id = "player-list";
  for (const p of state.players) {
    playerList.appendChild(buildPlayerLi(p, clientId, isGm, socket));
  }

  wrap.append(h2, playerList);

  if (isGm) {
    wrap.appendChild(renderGmControls(socket, clientId));
  } else {
    const waiting = el("p"); waiting.textContent = "Waiting for GM to start…";
    // Slot for the target preview — populated when the GM picks an image.
    // Patched in place by updateLobbyTargetPreview so it stays in sync as the
    // GM tweaks scale/colors.
    const previewSlot = el("div"); previewSlot.id = "lobby-target-preview"; previewSlot.style.marginTop = "1rem";
    wrap.append(waiting, previewSlot);
    if (state.config) renderLobbyPreviewInto(previewSlot, state.config);
  }

  app.appendChild(wrap);
}

function renderLobbyPreviewInto(
  slot: HTMLElement,
  config: Extract<ServerMsg, { type: "state" }>["config"],
) {
  slot.innerHTML = "";
  if (!config) return;
  const label = el("p"); label.textContent = `Target image (${config.gridW}×${config.gridH}):`;
  const pc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    editable: false,
  });
  pc.canvas.style.maxWidth = "300px";
  pc.canvas.style.height = "auto";
  slot.append(label, pc.canvas);
}

function updateLobbyTargetPreview(config: Extract<ServerMsg, { type: "state" }>["config"]) {
  const slot = document.getElementById("lobby-target-preview");
  if (slot) renderLobbyPreviewInto(slot, config);
}

// ── GM controls ───────────────────────────────────────────────────────────────

function renderGmControls(socket: PartySocket, _clientId: string): HTMLElement {
  const section = el("div", "margin-top:1rem");

  // Scale (pixelit native, 0–50). Higher = bigger grid = more detail.
  const scaleLabel = el("label"); scaleLabel.textContent = "Scale: ";
  const scaleInput = el("input") as HTMLInputElement;
  scaleInput.type = "range"; scaleInput.min = "1"; scaleInput.max = "50"; scaleInput.value = String(DEFAULT_SCALE);
  scaleInput.style.cssText = "vertical-align:middle;width:160px";
  const scaleVal = el("span"); scaleVal.textContent = String(DEFAULT_SCALE); scaleVal.style.marginLeft = "8px";
  scaleLabel.append(scaleInput, scaleVal);

  // Color count
  const colorLabel = el("label"); colorLabel.textContent = " Colors: ";
  const colorCount = el("input") as HTMLInputElement;
  colorCount.type = "number"; colorCount.value = String(DEFAULT_COLOR_COUNT); colorCount.min = "4"; colorCount.max = "32"; colorCount.style.width = "50px";
  colorLabel.appendChild(colorCount);

  // Draw time
  const timeLabel = el("label"); timeLabel.textContent = " Draw seconds: ";
  const drawSecs = el("input") as HTMLInputElement;
  drawSecs.type = "number"; drawSecs.value = "120"; drawSecs.min = "30"; drawSecs.max = "600"; drawSecs.style.width = "60px";
  timeLabel.appendChild(drawSecs);

  // Upload
  const uploadLabel = el("label"); uploadLabel.textContent = "Upload image: ";
  const fileInput = el("input") as HTMLInputElement;
  fileInput.type = "file"; fileInput.accept = "image/*";
  uploadLabel.appendChild(fileInput);

  const mobileWarn = el("p");
  mobileWarn.style.cssText = "color:orange;display:none";
  mobileWarn.textContent = "⚠ Grid exceeds 64px on its longest side — mobile players may struggle.";

  const preview = el("div", "margin-top:1rem");
  const startBtn = el("button"); startBtn.textContent = "Start game";
  startBtn.disabled = true;
  startBtn.style.marginTop = "1rem";

  let cachedFile: File | null = null;
  let lastConfig: GmConfigureMsg | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Used to discard out-of-order processImage results when the user changes
  // inputs faster than processing finishes.
  let runId = 0;

  async function reprocess() {
    if (!cachedFile) return;
    const myRun = ++runId;
    const scale = parseInt(scaleInput.value) || DEFAULT_SCALE;
    const count = parseInt(colorCount.value) || DEFAULT_COLOR_COUNT;

    preview.textContent = "Processing…";
    startBtn.disabled = true;
    mobileWarn.style.display = "none";

    try {
      const result = await processImage(cachedFile, scale, count);
      if (myRun !== runId) return; // stale; a newer run has started

      lastConfig = {
        type: "gm:configure",
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        drawSeconds: parseInt(drawSecs.value) || 120,
      };

      mobileWarn.style.display = isMobileWarning(Math.max(result.gridW, result.gridH)) ? "block" : "none";

      preview.innerHTML = "";
      const label = el("p"); label.textContent = `Target image (${result.gridW}×${result.gridH}):`;
      const pc = new PixelCanvas({
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        editable: false,
      });
      pc.canvas.style.maxWidth = "300px";
      pc.canvas.style.height = "auto";
      preview.append(label, pc.canvas);

      socket.send(JSON.stringify(lastConfig));
      startBtn.disabled = false;
    } catch (err) {
      if (myRun !== runId) return;
      preview.textContent = `Error: ${err}`;
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

  // Sample images — quick-pick for GMs without an image to hand.
  const samples = ["monalisa", "scream", "pearls"] as const;
  const samplesWrap = el("div", "display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap");
  const samplesLabel = el("span"); samplesLabel.textContent = "Or try a sample:";
  samplesWrap.appendChild(samplesLabel);
  for (const name of samples) {
    const btn = el("button"); btn.type = "button"; btn.textContent = name;
    btn.addEventListener("click", async () => {
      try {
        const url = `${import.meta.env.BASE_URL}assets/${name}.png`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const blob = await res.blob();
        cachedFile = new File([blob], `${name}.png`, { type: blob.type || "image/png" });
        // Clear the file input so re-clicking the same sample after picking a file still works.
        fileInput.value = "";
        reprocess();
      } catch (err) {
        preview.textContent = `Could not load sample "${name}": ${err}`;
      }
    });
    samplesWrap.appendChild(btn);
  }

  startBtn.addEventListener("click", () => {
    if (!lastConfig) return;
    // Read drawSeconds fresh in case the GM edited it after upload.
    const finalConfig: GmConfigureMsg = {
      ...lastConfig,
      drawSeconds: parseInt(drawSecs.value) || 120,
    };
    socket.send(JSON.stringify(finalConfig));
    socket.send(JSON.stringify({ type: "gm:start" } satisfies ClientMsg));
  });

  section.append(scaleLabel, el("br"), colorLabel, timeLabel, el("br"), el("br"), uploadLabel, samplesWrap, mobileWarn, preview, startBtn);
  return section;
}

// ── Drawing phase ─────────────────────────────────────────────────────────────

function renderDrawing(
  config: GmConfigureMsg,
  socket: PartySocket,
  _clientId: string,
  deadline: number | null,
): void {
  app.innerHTML = "";
  const wrap = el("div", "font-family:monospace;padding:1rem");

  // Countdown + done status
  const statusBar = el("div", "display:flex;gap:1.5rem;align-items:center;margin-bottom:8px");
  const timer = el("p"); timer.style.fontWeight = "bold"; timer.style.margin = "0";
  const doneStatus = el("p"); doneStatus.id = "done-status"; doneStatus.style.margin = "0"; doneStatus.style.color = "#888";
  statusBar.append(timer, doneStatus);

  // Side-by-side layout
  const canvasRow = el("div", "display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start");

  // Target (read-only)
  const targetWrap = el("div");
  const targetLabel = el("p"); targetLabel.textContent = "Target";
  const targetPc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    editable: false,
  });
  targetPc.canvas.style.cssText = "max-width:300px;height:auto;border:1px solid #444";
  targetWrap.append(targetLabel, targetPc.canvas);

  // Player canvas (editable)
  const drawWrap = el("div");
  const drawLabel = el("p"); drawLabel.textContent = "Your drawing";
  const playerPc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    editable: true,
  });
  playerPc.canvas.style.cssText = "max-width:300px;height:auto;border:1px solid #444";
  drawWrap.append(drawLabel, playerPc.canvas);

  canvasRow.append(targetWrap, drawWrap);

  // Swatch
  const swatch = buildSwatch(config.palette, i => playerPc.selectColor(i));
  swatch.style.marginTop = "1rem";

  // Brush controls
  const brushCtrl = buildBrushControls(playerPc);
  brushCtrl.style.marginTop = "8px";

  // Done button
  const doneBtn = el("button"); doneBtn.textContent = "Done";
  doneBtn.style.marginTop = "12px";

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

  // Countdown tick + auto-submit at deadline. We submit on the local clock; the
  // server's authoritative timer ends DRAWING regardless, and any post-deadline
  // submit gets dropped by the phase guard.
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
  // Best-effort: also cancel on socket close so we don't try to send after disconnect.
  socket.addEventListener("close", cancelAuto, { once: true });

  wrap.append(statusBar, canvasRow, swatch, brushCtrl, doneBtn);
  app.appendChild(wrap);
}

// ── Voting phase ──────────────────────────────────────────────────────────────

function renderVoting(_socket: PartySocket, _clientId: string): void {
  app.innerHTML = "";
  const wrap = el("div", "font-family:monospace;padding:2rem");
  const h2 = el("h2"); h2.textContent = "Voting";
  const p = el("p"); p.textContent = "Voting screen — TODO (Step 6).";
  if (cachedGallery) {
    const summary = el("p");
    summary.textContent = `Got ${cachedGallery.submissions.length} submissions on a ${cachedGallery.gridW}×${cachedGallery.gridH} grid.`;
    wrap.append(h2, p, summary);
  } else {
    wrap.append(h2, p);
  }
  app.appendChild(wrap);
}

// ── Results phase ─────────────────────────────────────────────────────────────

function renderResults(_socket: PartySocket, _clientId: string): void {
  app.innerHTML = "";
  const wrap = el("div", "font-family:monospace;padding:2rem");
  const h2 = el("h2"); h2.textContent = "Results";
  const p = el("p"); p.textContent = "Results screen — TODO (Step 7).";
  if (cachedResults) {
    const list = el("ol");
    for (const r of cachedResults.ranked) {
      const li = document.createElement("li");
      li.textContent = `${r.name}: ${r.votes} vote${r.votes === 1 ? "" : "s"}`;
      list.appendChild(li);
    }
    wrap.append(h2, p, list);
  } else {
    wrap.append(h2, p);
  }
  app.appendChild(wrap);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cssText?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cssText) (e as HTMLElement).style.cssText = cssText;
  return e;
}
