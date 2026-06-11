// Pixmaler entry point — route, connect, dispatch server messages.
// Per-screen rendering lives under `views/`.

import PartySocket from "partysocket";
import "./styles/main.scss";
import type { ClientMsg, ServerMsg } from "./types";
import { renderEntry } from "./views/index";
import { renderPaintSandbox } from "./views/paint";
import {
  renderLobby,
  updateLobbyTargetPreview,
  updatePlayerList,
} from "./views/phases/1-lobby";
import { renderDrawing, updateDoneStatus } from "./views/phases/2-drawing";
import { renderVoting } from "./views/phases/3-voting";
import { renderResults } from "./views/phases/4-results";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "127.0.0.1:1999";

// ── Identity / routing ──────────────────────────────────────────────────────

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

function getRoomFromUrl(): string | null {
  return new URLSearchParams(location.search).get("room");
}

const app = document.getElementById("app")!;
const roomCode = getRoomFromUrl();
const isPaintRoute = location.pathname.replace(/\/+$/, "").endsWith("/paint");

if (isPaintRoute) {
  renderPaintSandbox(app);
} else if (!roomCode) {
  renderEntry(app);
} else {
  connectToRoom(roomCode);
}

// ── Room connection ─────────────────────────────────────────────────────────

function connectToRoom(roomCode: string) {
  const clientId = getOrCreateClientId();
  const name = getOrCreateName() || clientId.slice(0, 6);

  app.replaceChildren(
    Object.assign(document.createElement("div"), {
      className: "page",
      textContent: `Connecting to ${roomCode}…`,
    }),
  );

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

// ── Server message dispatch ─────────────────────────────────────────────────

// Last-seen state from the server. We render off this snapshot rather than
// passing args through every dispatch path; reconnects and `phase`-only
// messages rely on it being kept up to date.
let lastState: Extract<ServerMsg, { type: "state" }> | null = null;
let renderedPhase: string | null = null;
let renderedGmClientId: string | null = null;
let cachedGallery: Extract<ServerMsg, { type: "gallery" }> | null = null;
let cachedResults: Extract<ServerMsg, { type: "results" }> | null = null;

// Cleanups registered by the current view (e.g. window keydown listeners).
// Run before re-rendering so the old view's listeners don't leak.
let viewCleanups: (() => void)[] = [];
function registerViewCleanup(fn: () => void) { viewCleanups.push(fn); }
function runViewCleanups() {
  const cleanups = viewCleanups;
  viewCleanups = [];
  for (const fn of cleanups) {
    try { fn(); } catch (e) { console.warn("[pixmaler] cleanup failed", e); }
  }
}

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
        // Patch the target preview for non-GM viewers when the GM picks or
        // changes the image. (For the GM, the preview lives inside their
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

function renderForPhase(socket: PartySocket, clientId: string) {
  if (!lastState) return;
  // Tear down listeners from the previous view before swapping the DOM out.
  runViewCleanups();

  switch (lastState.phase) {
    case "LOBBY":
      renderLobby(app, lastState, socket, clientId);
      break;
    case "DRAWING":
      if (lastState.config) {
        renderDrawing(app, lastState.config, socket, lastState.deadline, registerViewCleanup);
      }
      break;
    case "VOTING":
      renderVoting(app, cachedGallery);
      break;
    case "RESULTS":
      renderResults(app, cachedResults);
      break;
  }
}
