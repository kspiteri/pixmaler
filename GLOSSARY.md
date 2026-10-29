# Pixmaler

A real-time party game: the GM picks an image, it becomes a limited-palette target, players race the timer to redraw it, then vote and see the results.

Direct and explanatory copy, docs and comments use these terms. Flavour lines may play with metaphor ("hanging the exhibition…"), but never to name something a player has to act on. Code identifiers and wire names that predate a term (`gm:endSession`, `session-closed`, `SessionClosed`, `paintSession`, `referenceOpen`) are legacy; they don't change what the term is.

## Language

### Rooms and rounds

**Room**:
The live space players join by its word-pair code, from the moment it's opened until it closes. One GM, a roster of players, any number of rounds.
_Avoid_: Session, game, lobby (that's a phase), table

**Open (a room)**:
What a player does to make a new room and become its GM; "Reopen" makes a closed room's code live again.
_Avoid_: Create, start, host

**Close (a room)**:
What the GM does to shut a room for everyone and release its code; the player-facing action is "Close room". A room that sits idle is closed by the server instead.
_Avoid_: End session, shut down, wipe

**Round**:
One play-through in a room: the GM picks an image, everyone draws, votes and sees the results.
_Avoid_: Game, turn, match

**Phase**:
One stage of a round: LOBBY, DRAWING, VOTING or RESULTS. Written in capitals when it means the phase.
_Avoid_: Screen, step, stage

**Session**:
A run of rounds in one room with a running score (multi-round play). Not in the product yet.
_Avoid_: Series, set, tournament

**Game**:
Pixmaler itself, the product ("the game server", "a party game"). "Game mode" names a way to play it.
_Avoid_: App, site

**Free mode**:
The solo canvas: one player, no room, no timer, progress kept on the device.
_Avoid_: Sandbox, Paint, practice mode

### People

**Player**:
Anyone with a seat in a room, the GM included.
_Avoid_: Drawer, artist, user (in copy)

**GM**:
The player who runs the room: picks the image, starts rounds, closes the room.
_Avoid_: Host, admin, owner

**Spectator**:
A player who joined mid-round and sits it out until the next one; copy says they're "watching".
_Avoid_: Viewer, watcher, observer

**Seat**:
A player's place in the room's roster, which fixes their colour for the room's life.
_Avoid_: Slot, spot

### The image

**Source image**:
The image the GM picks or uploads, before it becomes the target. "Source" for short; copy names it only where it must be told apart from the target.
_Avoid_: Picture, photo, upload (as a noun), original

**Target**:
The limited-palette version of the source image that everyone redraws. Players see it as **the original** wherever it hangs or sits beside their canvas; "target" is the GM-setup and code word.
_Avoid_: Reference, picture

### Drawing

**Drawing**:
What a player makes in a round.
_Avoid_: Painting, artwork, entry, piece, submission (the wire's word)

**Canvas**:
The grid a player draws on.
_Avoid_: Board, sheet

### Voting and results

**Gallery**:
The round's drawings up for the vote, shown nameless on the salon wall in VOTING.
_Avoid_: Exhibition (flavour only), wall

**Salon wall**:
How the gallery is hung: frames crowded together salon-style, with the original among them.
_Avoid_: Grid, board

**Results**:
The RESULTS phase, where names are revealed with the winners, the awards, the ranking and each drawing's likeness.
_Avoid_: Reveal (flavour only), scoreboard, leaderboard

**Ranking**:
Every drawing in RESULTS that isn't on the podium, ordered by overall points.
_Avoid_: Gallery, the rest, runners-up

**Award**:
A title given in RESULTS by vote to the drawing, or joint drawings, that tops a category: Best or Funniest.
_Avoid_: Prize, trophy, category (a category is what a vote is cast in)

**Likeness**:
How closely a drawing matches the round's target, from 0 to 100; a wiped canvas has none. Unpainted cells count against it.
_Avoid_: Accuracy, closeness, and "score" as a noun (kept for running totals)
