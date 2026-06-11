// VOTING phase — placeholder (Step 6).

import { el } from "../../dom";
import type { ServerMsg } from "../../types";

type Gallery = Extract<ServerMsg, { type: "gallery" }>;

export function renderVoting(host: HTMLElement, gallery: Gallery | null) {
  const children: (HTMLElement | Text)[] = [
    el("h2", { text: "Voting" }),
    el("p", { text: "Voting screen — TODO (Step 6)." }),
  ];

  if (gallery) {
    children.push(el("p", {
      text: `Got ${gallery.submissions.length} submissions on a ${gallery.gridW}×${gallery.gridH} grid.`,
    }));
  }

  host.replaceChildren(el("div", { class: "page voting" }, children));
}
