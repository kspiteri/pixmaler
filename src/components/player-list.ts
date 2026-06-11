// Player list — single <li> per player with optional "Make GM" button when
// the viewer is the GM and the row is for a connected non-self player.

import PartySocket from "partysocket";
import { el } from "../dom";
import type { ClientMsg, Player, ServerMsg } from "../types";

type State = Extract<ServerMsg, { type: "state" }>;

export function buildPlayerLi(
  p: Player,
  viewerClientId: string,
  viewerIsGm: boolean,
  socket: PartySocket,
): HTMLLIElement {
  const li = el("li", {
    text: `${p.name}${p.isGm ? " (GM)" : ""}${p.connected ? "" : " [offline]"}`,
  });

  if (viewerIsGm && p.connected && p.clientId !== viewerClientId && !p.isGm) {
    const btn = el("button", { class: "lobby__make-gm-btn", type: "button", text: "Make GM" });
    btn.addEventListener("click", () => {
      if (!confirm(`Transfer GM to ${p.name}?`)) return;
      const msg: ClientMsg = { type: "gm:transfer", toClientId: p.clientId };
      socket.send(JSON.stringify(msg));
    });
    li.appendChild(btn);
  }
  return li;
}

export function renderPlayerListInto(
  list: HTMLElement,
  state: State,
  viewerClientId: string,
  socket: PartySocket,
) {
  const viewerIsGm = state.gmClientId === viewerClientId;
  list.replaceChildren(
    ...state.players.map(p => buildPlayerLi(p, viewerClientId, viewerIsGm, socket)),
  );
}
