// RESULTS phase — placeholder (Step 7).

import { el } from "../../dom";
import type { ServerMsg } from "../../types";

type Results = Extract<ServerMsg, { type: "results" }>;

export function renderResults(host: HTMLElement, results: Results | null) {
  const children: HTMLElement[] = [
    el("h2", { text: "Results" }),
    el("p", { text: "Results screen — TODO (Step 7)." }),
  ];

  if (results) {
    const list = el("ol", {}, results.ranked.map(r =>
      el("li", { text: `${r.name}: ${r.votes} vote${r.votes === 1 ? "" : "s"}` }),
    ));
    children.push(list);
  }

  host.replaceChildren(el("div", { class: "page results" }, children));
}
