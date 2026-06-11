// Entry screen — pre-room landing. "Create room" / "Join room" / sandbox link.

import { uniqueNamesGenerator } from "unique-names-generator";
import { adjectives, nouns } from "../words";
import { el } from "../dom";

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

export function renderEntry(host: HTMLElement) {
  const nameInput = el("input", {
    class: "entry__field-input",
    type: "text", placeholder: "e.g. Keith", value: getOrCreateName(),
  });
  const nameLabel = el("label", { class: "entry__field" }, ["Your name", nameInput]);

  const createBtn = el("button", { class: "entry__btn", text: "Create room (GM)" });
  createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) { alert("Enter your name first."); return; }
    localStorage.setItem("pixmaler:name", name);
    location.href = `${location.pathname}?room=${generateRoomCode()}`;
  });

  const codeInput = el("input", {
    class: "entry__field-input",
    type: "text", placeholder: "e.g. feral-crayon",
  });
  const codeLabel = el("label", { class: "entry__field" }, ["Room code", codeInput]);

  const joinBtn = el("button", { class: "entry__btn", text: "Join room" });
  joinBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toLowerCase();
    if (!name) { alert("Enter your name first."); return; }
    if (!code) { alert("Enter a room code."); return; }
    localStorage.setItem("pixmaler:name", name);
    location.href = `${location.pathname}?room=${code}`;
  });

  // Strip any trailing "index.html" so BASE_URL ("/pixmaler/") prefixes /paint
  // correctly in dev and prod alike.
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const sandboxLink = el("a", {
    class: "entry__sandbox-link",
    href: `${base}/paint`,
    text: "Or open the Paint sandbox →",
  });

  const wrap = el("div", { class: "page page--narrow entry" }, [
    el("h1", { text: "Pixmaler" }),
    el("p", { class: "entry__sub", html: "pixel + <em>maler</em> (Norwegian: painter)" }),
    nameLabel,
    createBtn,
    el("hr"),
    codeLabel,
    joinBtn,
    sandboxLink,
  ]);

  host.replaceChildren(wrap);
}
