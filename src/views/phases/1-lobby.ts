// LOBBY phase — player list + (for the GM) image picker / start button, or
// (for everyone else) "Waiting for GM…" with the target preview when ready.

import PartySocket from "partysocket";
import { el } from "../../dom";
import type { ClientMsg, GmConfigureMsg, ServerMsg } from "../../types";
import { renderPlayerListInto } from "../../components/player-list";
import { buildImagePicker } from "../../components/image-picker";
import { PixelCanvas } from "../../canvas";

type State = Extract<ServerMsg, { type: "state" }>;

export function renderLobby(
  host: HTMLElement,
  state: State,
  socket: PartySocket,
  clientId: string,
) {
  const isGm = state.gmClientId === clientId;
  const roomCode = new URLSearchParams(location.search).get("room") ?? "";

  const list = el("ul", { class: "lobby__list", id: "player-list" });
  renderPlayerListInto(list, state, clientId, socket);

  const wrap = el("div", { class: "page page--mid lobby" }, [
    el("h2", { text: `Room: ${roomCode}` }),
    list,
  ]);

  if (isGm) {
    wrap.appendChild(renderGmControls(socket));
  } else {
    wrap.appendChild(el("p", { class: "lobby__waiting", text: "Waiting for GM to start…" }));
    // Slot for the target preview — patched by updateLobbyTargetPreview when
    // the GM picks or changes the image.
    const previewSlot = el("div", { class: "lobby__preview", id: "lobby-target-preview" });
    wrap.appendChild(previewSlot);
    if (state.config) renderLobbyPreviewInto(previewSlot, state.config);
  }

  host.replaceChildren(wrap);
}

function renderLobbyPreviewInto(slot: HTMLElement, config: State["config"]) {
  slot.replaceChildren();
  if (!config) return;
  const pc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    editable: false,
  });
  slot.append(
    el("p", { text: `Target image (${config.gridW}×${config.gridH}):` }),
    pc.canvas,
  );
}

export function updateLobbyTargetPreview(config: State["config"]) {
  const slot = document.getElementById("lobby-target-preview");
  if (slot) renderLobbyPreviewInto(slot, config);
}

export function updatePlayerList(state: State, socket: PartySocket, viewerClientId: string) {
  const list = document.getElementById("player-list");
  if (list) renderPlayerListInto(list, state, viewerClientId, socket);
}

// ── GM controls ──────────────────────────────────────────────────────────────

function renderGmControls(socket: PartySocket): HTMLElement {
  const startBtn = el("button", {
    class: "lobby__start-btn",
    text: "Start game",
    disabled: true,
  });

  let lastConfig: GmConfigureMsg | null = null;

  const picker = buildImagePicker({
    showMobileWarn: true,
    showDrawSeconds: true,
    showPreview: true,
    onProcessing: () => { startBtn.disabled = true; },
    onResult: (result) => {
      lastConfig = {
        type: "gm:configure",
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        drawSeconds: picker.getDrawSeconds(),
      };
      socket.send(JSON.stringify(lastConfig));
      startBtn.disabled = false;
    },
  });

  startBtn.addEventListener("click", () => {
    if (!lastConfig) return;
    // Read drawSeconds fresh in case the GM edited it after the last reprocess.
    const finalConfig: GmConfigureMsg = {
      ...lastConfig,
      drawSeconds: picker.getDrawSeconds(),
    };
    socket.send(JSON.stringify(finalConfig));
    socket.send(JSON.stringify({ type: "gm:start" } satisfies ClientMsg));
  });

  return el("div", { class: "lobby__gm-controls" }, [picker.element, startBtn]);
}
