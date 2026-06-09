import type * as Party from "partykit/server";
import type {
  Phase,
  Player,
  ClientMsg,
  GmConfigureMsg,
  StateMsg,
  ServerMsg,
} from "../src/types";

interface RoomState {
  phase: Phase;
  // Keyed by clientId throughout — conn.id tracked separately in connMap.
  players: Map<string, Player>;
  // Maps conn.id → clientId for fast lookup in message/close handlers.
  connMap: Map<string, string>;
  gmClientId: string;
  config: GmConfigureMsg | null;
  deadline: number | null;
  submissions: Map<string, number[]>; // clientId → grid
  votes: Map<string, string>; // voterClientId → submissionId (= clientId of submitter)
  drawTimer: ReturnType<typeof setTimeout> | null;
}

export default class PixmalerServer implements Party.Server {
  private state: RoomState = {
    phase: "LOBBY",
    players: new Map(),
    connMap: new Map(),
    gmClientId: "",
    config: null,
    deadline: null,
    submissions: new Map(),
    votes: new Map(),
    drawTimer: null,
  };

  constructor(readonly room: Party.Room) {}

  // ── HTTP existence check ───────────────────────────────────────────────────
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === "GET") {
      const exists = [...this.state.players.values()].some(p => p.connected);
      return new Response(JSON.stringify({ exists }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────
  onConnect(conn: Party.Connection) {
    conn.send(JSON.stringify(this.buildState()));
  }

  onClose(conn: Party.Connection) {
    const clientId = this.state.connMap.get(conn.id);
    this.state.connMap.delete(conn.id);
    if (!clientId) return;
    const player = this.state.players.get(clientId);
    if (!player) return;
    player.connected = false;
    this.autoPromoteGm();
    this.broadcastAll(this.buildState());
  }

  // ── Message handler ────────────────────────────────────────────────────────
  onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw) as ClientMsg; }
    catch { return; }

    switch (msg.type) {
      case "join":          return this.handleJoin(msg, sender);
      case "gm:configure":  return this.handleConfigure(msg, sender);
      case "gm:start":      return this.handleStart(sender);
      case "draw:done":     return this.handleDrawDone(sender);
      case "draw:submit":   return this.handleSubmit(msg, sender);
      case "vote:cast":     return this.handleVote(msg, sender);
      case "gm:stopVoting": return this.handleStopVoting(sender);
      case "gm:playAgain":  return this.handlePlayAgain(sender);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleJoin(msg: Extract<ClientMsg, { type: "join" }>, conn: Party.Connection) {
    this.state.connMap.set(conn.id, msg.clientId);

    const existing = this.state.players.get(msg.clientId);
    if (existing) {
      existing.connected = true;
    } else {
      const isFirst = this.state.players.size === 0;
      const player: Player = {
        clientId: msg.clientId,
        name: msg.name,
        isGm: isFirst,
        connected: true,
        doneDrawing: false,
      };
      if (isFirst) this.state.gmClientId = msg.clientId;
      this.state.players.set(msg.clientId, player);
    }
    this.broadcastAll(this.buildState());
  }

  private handleConfigure(msg: Extract<ClientMsg, { type: "gm:configure" }>, conn: Party.Connection) {
    if (!this.isGm(conn)) return;
    if (this.state.phase !== "LOBBY") return;
    this.state.config = msg;
    this.broadcastAll(this.buildState());
  }

  private handleStart(conn: Party.Connection) {
    if (!this.isGm(conn)) return;
    if (this.state.phase !== "LOBBY") return;
    if (!this.state.config) return;

    // Require at least 2 non-GM connected players so there are meaningful submissions.
    const nonGmConnected = [...this.state.players.values()].filter(
      p => p.connected && p.clientId !== this.state.gmClientId
    );
    if (nonGmConnected.length < 2) {
      conn.send(JSON.stringify({ type: "error", message: "Need at least 2 players (plus GM) to start." } satisfies ServerMsg));
      return;
    }

    this.clearDrawTimer();
    const deadline = Date.now() + this.state.config.drawSeconds * 1000;
    this.state.phase = "DRAWING";
    this.state.deadline = deadline;
    this.state.submissions.clear();
    this.state.votes.clear();
    for (const p of this.state.players.values()) p.doneDrawing = false;

    this.broadcastAll({ type: "phase", phase: "DRAWING", deadline } satisfies ServerMsg);
    this.state.drawTimer = setTimeout(() => this.endDrawing(), this.state.config.drawSeconds * 1000);
  }

  private handleDrawDone(conn: Party.Connection) {
    const player = this.playerByConn(conn);
    if (!player || this.state.phase !== "DRAWING") return;
    player.doneDrawing = true;
    this.broadcastDoneStatus();
  }

  private handleSubmit(msg: Extract<ClientMsg, { type: "draw:submit" }>, conn: Party.Connection) {
    const player = this.playerByConn(conn);
    if (!player || this.state.phase !== "DRAWING") return;
    // submissionId === clientId — the vote self-check in handleVote relies on this.
    this.state.submissions.set(player.clientId, msg.grid);
    player.doneDrawing = true;
    this.broadcastDoneStatus();
  }

  private handleVote(msg: Extract<ClientMsg, { type: "vote:cast" }>, conn: Party.Connection) {
    const voter = this.playerByConn(conn);
    if (!voter || this.state.phase !== "VOTING") return;
    // submissionId is the clientId of the submitter (see handleSubmit).
    if (msg.submissionId === voter.clientId) {
      conn.send(JSON.stringify({ type: "error", message: "Cannot vote for yourself." } satisfies ServerMsg));
      return;
    }
    if (this.state.votes.has(voter.clientId)) {
      conn.send(JSON.stringify({ type: "error", message: "Already voted." } satisfies ServerMsg));
      return;
    }
    this.state.votes.set(voter.clientId, msg.submissionId);

    const connectedCount = [...this.state.players.values()].filter(p => p.connected).length;
    if (this.state.votes.size >= connectedCount) this.endVoting();
  }

  private handleStopVoting(conn: Party.Connection) {
    if (!this.isGm(conn)) return;
    if (this.state.phase !== "VOTING") return;
    this.endVoting();
  }

  private handlePlayAgain(conn: Party.Connection) {
    if (!this.isGm(conn)) return;
    this.clearDrawTimer();
    this.state.phase = "LOBBY";
    this.state.config = null;
    this.state.deadline = null;
    this.state.submissions.clear();
    this.state.votes.clear();
    for (const p of this.state.players.values()) p.doneDrawing = false;
    this.broadcastAll(this.buildState());
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  private endDrawing() {
    this.clearDrawTimer();
    if (this.state.phase !== "DRAWING") return;
    this.state.phase = "VOTING";
    this.state.deadline = null;
    const cfg = this.state.config!;

    this.broadcastAll({
      type: "gallery",
      submissions: [...this.state.submissions.entries()].map(([clientId, grid]) => ({
        submissionId: clientId,
        grid,
      })),
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg);
    this.broadcastAll({ type: "phase", phase: "VOTING", deadline: null } satisfies ServerMsg);
  }

  private endVoting() {
    if (this.state.phase !== "VOTING") return;
    this.state.phase = "RESULTS";
    const cfg = this.state.config!;

    const tally = new Map<string, number>();
    for (const clientId of this.state.submissions.keys()) tally.set(clientId, 0);
    for (const subId of this.state.votes.values()) tally.set(subId, (tally.get(subId) ?? 0) + 1);

    const ranked = [...this.state.submissions.entries()]
      .map(([clientId, grid]) => ({
        submissionId: clientId,
        clientId,
        name: this.state.players.get(clientId)?.name ?? "Unknown",
        votes: tally.get(clientId) ?? 0,
        grid,
      }))
      .sort((a, b) => b.votes - a.votes);

    this.broadcastAll({ type: "phase", phase: "RESULTS", deadline: null } satisfies ServerMsg);
    this.broadcastAll({ type: "results", ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH } satisfies ServerMsg);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private playerByConn(conn: Party.Connection): Player | undefined {
    const clientId = this.state.connMap.get(conn.id);
    return clientId ? this.state.players.get(clientId) : undefined;
  }

  private isGm(conn: Party.Connection): boolean {
    const clientId = this.state.connMap.get(conn.id);
    return clientId === this.state.gmClientId;
  }

  private autoPromoteGm() {
    const gm = this.state.players.get(this.state.gmClientId);
    if (gm?.connected) return;
    const next = [...this.state.players.values()].find(p => p.connected);
    if (next) {
      next.isGm = true;
      this.state.gmClientId = next.clientId;
    }
  }

  private clearDrawTimer() {
    if (this.state.drawTimer) {
      clearTimeout(this.state.drawTimer);
      this.state.drawTimer = null;
    }
  }

  private buildState(): StateMsg {
    return {
      type: "state",
      phase: this.state.phase,
      players: [...this.state.players.values()],
      gmClientId: this.state.gmClientId,
      config: this.state.config,
      deadline: this.state.deadline,
      doneCount: this.state.submissions.size,
      // Exclude GM — they don't submit a drawing.
      totalDrawing: [...this.state.players.values()].filter(
        p => p.connected && p.clientId !== this.state.gmClientId
      ).length,
    };
  }

  private broadcastAll(msg: ServerMsg) {
    this.room.broadcast(JSON.stringify(msg));
  }

  private broadcastDoneStatus() {
    this.broadcastAll({
      type: "done-status",
      doneCount: this.state.submissions.size,
      totalDrawing: [...this.state.players.values()].filter(
        p => p.connected && p.clientId !== this.state.gmClientId
      ).length,
    });
  }
}
