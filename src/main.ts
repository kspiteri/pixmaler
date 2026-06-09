import PartySocket from "partysocket";
import { uniqueNamesGenerator } from "unique-names-generator";
import { adjectives, nouns } from "./words";
import type { ServerMsg, ClientMsg } from "./types";

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
  // No room in URL — show lobby entry UI
  app.innerHTML = `
    <div style="font-family:monospace;padding:2rem;max-width:400px">
      <h1>Pixmaler</h1>
      <p>pixel + <em>maler</em> (Norwegian: painter)</p>
      <hr/>
      <label>Your name<br/><input id="name-input" type="text" placeholder="e.g. Keith" /></label>
      <br/><br/>
      <button id="create-btn">Create room (GM)</button>
      <hr/>
      <label>Room code<br/><input id="room-input" type="text" placeholder="e.g. feral-crayon" /></label>
      <br/><br/>
      <button id="join-btn">Join room</button>
    </div>
  `;

  const nameInput = document.getElementById("name-input") as HTMLInputElement;
  nameInput.value = getOrCreateName();

  document.getElementById("create-btn")!.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) { alert("Enter your name first."); return; }
    localStorage.setItem("pixmaler:name", name);
    const code = generateRoomCode();
    location.href = `${location.pathname}?room=${code}`;
  });

  document.getElementById("join-btn")!.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = (document.getElementById("room-input") as HTMLInputElement).value.trim().toLowerCase();
    if (!name) { alert("Enter your name first."); return; }
    if (!code) { alert("Enter a room code."); return; }
    localStorage.setItem("pixmaler:name", name);
    location.href = `${location.pathname}?room=${code}`;
  });
} else {
  // Room code in URL — connect
  const clientId = getOrCreateClientId();
  const name = getOrCreateName() || clientId.slice(0, 6);

  const connectingDiv = document.createElement("div");
  connectingDiv.style.cssText = "font-family:monospace;padding:2rem";
  const connectingP = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = roomCode;
  connectingP.append("Connecting to ", strong, "…");
  connectingDiv.appendChild(connectingP);
  app.replaceChildren(connectingDiv);

  const socket = new PartySocket({
    host: PARTYKIT_HOST,
    room: roomCode,
  });

  socket.addEventListener("open", () => {
    const msg: ClientMsg = { type: "join", clientId, name };
    socket.send(JSON.stringify(msg));
  });

  socket.addEventListener("message", (ev) => {
    let msg: ServerMsg;
    try { msg = JSON.parse(ev.data as string) as ServerMsg; }
    catch { console.error("[pixmaler] bad message", ev.data); return; }
    console.log("[pixmaler]", msg);
    // Phase-specific UI will be wired up in subsequent build steps.
    const pre = document.createElement("pre");
    pre.style.cssText = "font-family:monospace;padding:2rem";
    pre.textContent = JSON.stringify(msg, null, 2);
    app.replaceChildren(pre);
  });

  socket.addEventListener("close", () => {
    console.warn("[pixmaler] socket closed");
  });
}
