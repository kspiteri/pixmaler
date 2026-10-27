# Design system

How Pixmaler looks and reads: copy voice, feedback, controls, colour and theme, type, surfaces, tilt, player chips, the shared UI components and the styling mechanics behind them. [`AGENTS.md`](../AGENTS.md) holds the short-form rules; this file holds the detail and the traps. How the code *works* — state, rooms, audio, identity — is in [`architecture.md`](./architecture.md); the server is in [`party/README.md`](../party/README.md).

## Voice and copy

- **British English** in user-facing strings, comments and docs. Identifiers that mirror DOM/web APIs stay as they are (`color` in CSS, `fillStyle` on canvas).
- **Copy sits in three bands; lowercase is the floor, Sentence case earns its place.**
  - **Flavour** — the game's voice ([`taglines.ts`](../src/lib/content/taglines.ts)): lowercase, dry, self-deprecating, a comma or full-stop pivot. Idle, empty, waiting, no-winner and roll-call states ("hanging the exhibition…", "counting the damage…").
  - **Explanatory** — spectator notes, status lines: clear first, a light touch of voice, never a joke that obscures.
  - **Direct** — instructions, form labels, errors, GM controls, Settings, confirm dialogs, the connection banner: plain, Sentence case. **Instructions never joke** — a joke on a control is ambiguity.
- **Voice on completion lines, not counts:** "the votes are in…" carries it; the live tally beside it ("3 of 5 voted") stays plain.
- **No em-dashes in player-facing copy** (comma, colon or full stop); comments and docs keep them. **No exclamation marks** except the earned `ready!`.
- **Lowercase eyebrows are a style** ("game setup", "room full") and stay lowercase; a real **form label** is Sentence case ("Your name"). Initialisms keep their capitals (`GM`, `GitHub`).
- **Copy never rotates while a screen is up.** Status lines are fixed per site; [`Tagline.vue`](../src/components/elements/Tagline.vue) shows one line per mount (a `seed`, else one random tagline) and never changes it — rotating copy on a waiting screen reads as a bug.

## Feedback and announcements

- **No `alert()` / `confirm()`** — `no-alert` is an ESLint error, no exemptions. Modals go through [`lib/dialog.ts`](../src/lib/dialog.ts): `askAlert(msg)` for a refused action, `askConfirm(msg, { confirm, cancel? })` for a guard, both awaitable (`if (!await askConfirm(…)) return`). Requests queue into the one `AlertDialog.vue` in `App.vue`.
- **A confirm names its action** ("End voting" / "Keep voting", never OK/Cancel) so the buttons answer the question alone; `cancel` defaults to "Cancel" where unambiguous.
- **The register, by how much it takes from the player:**
  - [`AlertNotice.vue`](../src/components/elements/AlertNotice.vue) blocks nothing. Dismissable by default (a nudge: blank canvas, round cancelled); with `:dismissable="false"` it reports state the host shows and hides (the `.conn-banner`, pinned top-centre), where a dismiss control would only lose information. The host positions it.
  - `AlertDialog.vue` blocks until answered.
  - [`PhaseBoundary.vue`](../src/components/layout/PhaseBoundary.vue) is for a view that has *died*: it replaces the screen.
  - A condition that clears itself is not a dialog.
- **A notice's `variant` sets ink and politeness together:** only `error` interrupts (`role="alert"`, `$danger-ink`); `warn` (`$warn-ink`) and `info` use `role="status"`. `info` takes a neutral `$border` edge. There's no `success` variant or green token.
- **In-place regions that annotate visible text keep their own `role="status"`** — the countdowns ([`countdown.ts`](../src/lib/composables/countdown.ts)), the Voting tally, the Drawing done-count, the picker size warning, the Lobby start hint, the Paint empty state; SettingsMenu's text-size readout is `aria-live="polite"`.
- **A one-off message with no visible home uses [`announce()`](../src/lib/announce.ts)** (e.g. the room-link copy and a drawing's Save or Share, all only an icon swap): one polite and one assertive `sr-only` region mounted once in `App.vue`. A live region must exist before its text changes, and `announce` clears then re-sets on the next frame so a repeat still speaks.
- **An action that finishes off-screen swaps its icon to a tick for 2 s** (`Check`, as on the room-link copy and [`ExportButton`](../src/components/game/shared/ExportButton.vue)), with the `aria-label` flipped (the tooltip keeps the label, so the name isn't spoken twice) and an `announce()`. The wording follows what happened, never where it landed: "Shared <name>'s card" after the share sheet, "Saved <name>'s drawing" after a download (a download can't report that it finished), never "Saved to Photos". A cancelled share sheet gets no tick. **A failure swaps to `TriangleAlert` in normal ink for 2 s** with "Couldn't save" / "Couldn't share" and an assertive `announce()`; the shape carries the state, not colour. Busy is `aria-disabled` + `aria-busy`, never `disabled`, which would drop keyboard focus.
- **`AlertDialog` is not a live region** — a modal announces by taking focus with `role="alertdialog"` + `aria-describedby`. Don't add aria-live.

## Controls and the press

- **Every button is [`Button.vue`](../src/components/elements/Button.vue):** `variant` (`primary` / `secondary` / `tertiary` / `subtle`, default `tertiary`) × `size` (`large` / `default` / `small` / `x-small`), plus `icon`, `block`, `collapse`, `tone="danger"`, `href` (renders `<a>`). It owns fill, border, press, hover, focus, disabled and `aria-busy`; a caller passes only a layout class (via `$attrs`). `collapse` hides the label under `$bp-mobile`, so it needs an `aria-label`.
  - `tertiary` is the quiet *filled* key — neutral fill, bevel, primary's typography — so a vote button can swap primary ⇄ tertiary without reflowing. `subtle` is the ghost: transparent, body voice, no bevel.
- **Every control presses.** One rule in [`_buttons.scss`](../src/styles/components/_buttons.scss) (`.btn, .pressable`) rests the element on a hard offset shadow and travels it down on `:active`. Variants tune custom properties, never add a rule: `--press` (travel, default 2 px; primary 4 px), `--press-colour` (default `$shadow-press`), and for a *filled* variant `--bevel` / `--bevel-pressed` — a zero-blur 2 px lit top edge and shaded bottom edge (`$bevel-fill`), the pixel-art half of the look. `.no-shadow` keeps the travel without the shadow.
- **A non-`Button` control opts in with `.pressable`** — the toggle switch, avatar-picker cells, picker samples and Browse, the room-code chip, `/paint`'s settings toggle. Miss it and the control is dead to the touch, with nothing to flag it.
- **A drawing's own controls sit under its name and points, never over the art.** On RESULTS that's a row (`.results__exports`) of icon-only `x-small` `subtle` `Button`s with 14px icons, Save (`Download`) then Share (`Share2`), each `aria-label` naming the player ("Save <name>'s drawing", "Share <name>'s card"; your own entry "Save your drawing" / "Share your card"); under a coarse pointer each gets a 40px hit area without growing. In Paint they're labelled `tertiary` `collapse` buttons with 16px icons beside Clear drawing, both disabled until something is drawn.
- **One exemption: `.segmented__item`.** `.segmented` is `overflow: hidden` with flush joins, so a travel would clip; its focus ring is inset for the same reason.
- **Icon-only segmented groups** (the palette's placement control and the drawing-tool row) give every item an `aria-label` and a matching `title`. A size slider is disabled, never hidden, on a tool without a size (Fill): its thumb rests at the start and it reads "Fill has no size", and the dock never reflows on a tool switch.
- **The press owns `transform`.** Anything else that moves a pressable uses standalone `rotate` / `translate` / `scale`.
- **Reduced motion drops the easing, never the travel** — on touch the movement is the only feedback.
- **The winner confetti is pure decoration, so reduced motion drops it entirely** (unlike a press, where the travel stays). The RESULTS-reveal burst goes through [`lib/confetti.ts`](../src/lib/confetti.ts) (#43): an `aria-hidden` / `inert` / `pointer-events:none` layer, square confetti in the seat-colour tokens plus the award icons (**never native emoji** — OS fonts break the pixel look), gone within 5 s, lazy-loaded on RESULTS (and the dev `/components` demo).
- **Every on/off control is [`ToggleSwitch.vue`](../src/components/elements/ToggleSwitch.vue)** (`v-model`, `label`, `describedby`, `#off`/`#on` slots, `role="switch"`). Off: empty track, grey knob; on: lime track, dark knob — state reads from colour, not only position.
- **Text links take no press** (SettingsMenu's footer, Entry's Free mode link).

## Colour

### Names and values

- **[`_theme.scss`](../src/styles/foundation/_theme.scss) writes every theme-varying value** (a `dark` and a `light` mixin, plus the constant `--paper`); **[`_tokens.scss`](../src/styles/foundation/_tokens.scss) names them** (`$bg: var(--bg)`), so a call site never changes with the theme. `_tokens.scss` also holds the theme-agnostic literals (`$accent`, `$accent-fg`, `$primary`, the `-deep` shades, `$ink-on-colour`, `$scrim`, `$bevel-fill`, `$player-colours`). Only these two files may contain a colour literal.
- **Emission order is load-bearing:** `:root` (dark), then `@media (prefers-color-scheme: light)`, then `[data-theme='light' | 'dark']`. The attribute blocks tie with `:root` on specificity, so only source order lets an explicit choice beat the OS.
- **`_tokens.scss` stays rule-free** — scoped `<style>` blocks `@use` it and Vue compiles each separately, so a rule would be emitted once per block, scope-attributed.
- Palettes hang off `[data-theme]` selectors, so any element can carry one — the dev-only `/components` gallery renders dark and light panes side by side.

### Fills vs ink

- **The test: does the colour bring its own background?** `$accent` (lime) and `$primary` (purple) are fills carrying their own ink (`$accent-fg` on lime is 16.3:1), so they never change.
- **As text or a line, use the themed ink:** `$accent-ink`, `$primary-ink`, `$warn-ink`, `$danger-ink`. Bright lime is 1.16:1 on the light page (failing even the 3:1 non-text floor) and plain `$primary` 3.18:1. `.btn--secondary` shows the split: `$primary-ink` outline and label, `$primary` hover fill.
- **A frame or a bar on a track is ink, not fill:** the winner's frame reads against the card (`--frame-winner-*` is themed) and the timer ribbon against its `$surface` track (`--timer-*` is themed).
- **Text ramp:** `$fg-80` … `$fg-20`; `$fg-35` and below are non-text only. Quiet copy is `$muted`.

### Lime means "go" and "chosen"

- It fills the primary CTA and marks what the player has picked or earned: the selected segment, swatch and sample, a switch that's on, the slider's filled track, text selection, their awards, the **"yours" mark on the Results reveal** (a `__you` chip and a ring on your own card), the winner's frame. The wordmark is brand lime (a logotype is exempt), and so is the seat chip on a share card made in Paint, which has no seat: an exported image, not UI, so nothing there reads as selected. **Nothing else is lime.**
- **Focus is page ink** — a 2 px `$fg` `:focus-visible` ring app-wide, inputs included. Room codes, `/paint`'s open settings toggle, the music widget (and its playing pulse), spinners and links are page ink too.
- A slider whose value isn't a choice (music volume) takes **`.slider--neutral`** (`--slider-fill: $fg-60`).
- **Purple means the GM and the secondary button**, never "selected".
- If a new mark shows state, focus or emphasis rather than a choice, it isn't lime.

### Colours that don't follow the page

If a colour sits on something other than the page, it belongs here:

- **`$paper`** (`#ffffff` in both themes) — the drawing is paper and untouched `-1` cells land on it; `PixelCanvas` reads `var(--paper)`.
- **`$ink-on-colour`** — chip letters and faces sit on a seat colour; following `$bg` would break all 21 seats.
- **`$scrim`** — darkens either way. Use it for backdrops even though `$accent-fg` shares the hex.
- **The reference crosshair's `#000` / `#0ff`** in [`pixel.ts`](../src/lib/canvas/pixel.ts) — it sits on the artwork.

### The literal guard

- **No literal palette hex;** reference the semantically right token (`$paper`, not `$fg`, for the drawing).
- **`color-mix()` takes a token to an alpha.** No Sass colour functions: deep shades are static tokens, and no mixin computes a colour.
- **[`.stylelintrc.json`](../.stylelintrc.json) fails** any hex, or `rgb()`/`hsl()` in `color` / `background*` / `border*` / `fill` / `stroke` / `outline*`, outside `_theme.scss` and `_tokens.scss`. Shadows, filters and gradients keep the black-alpha idiom. Runs in pre-commit and `pnpm lint:css`.

## Theme switch

- **Following the OS needs no JavaScript and cannot flash** — `_theme.scss`'s media query does it.
- [`src/lib/prefs/theme.ts`](../src/lib/prefs/theme.ts) only writes an *explicit* choice (`pixmaler:theme`, `data-theme` on `<html>`), re-applied before first paint by an inline script in [`index.html`](../index.html). Module-level: one theme per document. An unrecognised stored value means "follow the OS", not dark. The swap cross-fades via a View Transition.
- [`ThemeToggle.vue`](../src/components/elements/ThemeToggle.vue) is a thin `ToggleSwitch` binding: sun off/light, moon on/dark, `aria-checked` = dark.

## Type and fonts

- **Text size scales type only.** [`src/lib/prefs/textScale.ts`](../src/lib/prefs/textScale.ts) sets `--text-scale` on `:root`; only the type tokens read it, via `fs()` in `_tokens.scss` (`$fs-2xs`…`$fs-2xl` = `calc(<rem> * var(--text-scale, 1))`). The root font-size is untouched, so `rem` spacing stays put — scaling the root balloons the layout and char-wraps names. Pre-paint-applied in `index.html`; the 100% default stores nothing.
- **Author font-size through a `$fs-*` token, never a literal `rem`**, or it won't follow the control. Off-rung sizes call `fs()` directly (`_drawing.scss`'s countdown). `$fs-3xl` and the `-fluid` rungs are branding/hero and don't scale.
- **A control sized to its own text uses `em`** (`.segmented__item`'s min-width and padding), or multi-character values crowd as type grows.
- **A compact subtree opts out with `--text-scale: 1`** on its root — `.tools-panel`, so the palette never outgrows its width over the fixed canvas.
- **Fonts are self-hosted, never Google's CDN** (which ships the visitor's IP to a third party). [`_fonts.scss`](../src/styles/foundation/_fonts.scss) declares Fredoka (display), Plus Jakarta Sans (body) and Space Grotesk (buttons, alerts, segmented values) from woff2 in `src/assets/fonts/` — Latin + Latin-Extended, loaded weights only, relative `url()`s so Vite hashes them. No font `<link>` in `index.html`. Regenerate by fetching Google's `css2` with a browser user agent and downloading the `latin` + `latin-ext` blocks.
- **No pixel or bitmap faces** — they read poorly to dyslexic readers. The pixel look comes from geometry (near-square corners, bevels, square swatches and thumbs).

## Surfaces, radius and depth

- **Three surface roles:**
  - **Artefact** ([`_surfaces.scss`](../src/styles/components/_surfaces.scss)): `.art-surface` is `$paper` with square corners (a canvas has none), wrapped in `.art-frame` (bevelled `--frame-*` border, `$shadow-1`; `--winner` for the lime frame) once finished and on show. **Two elements, not one** — the canvas sizes off the surface's `aspect-ratio`, so a border on that box would crop it. `DrawBoard` has neither: the frame is earned when the drawing is done.
  - **Chrome** — panels, inputs, settings: the `chrome()` mixin ([`_chrome.scss`](../src/styles/mixins/_chrome.scss)), container recipe by default; `$rung: $radius` for inputs and toggles. Don't hand-roll the triple.
  - **Person / choice** — lobby roster rows and Results cards: coloured or neutral card, generous radius, `wonk()` tilt.
- **The radius rung says what a thing is:** `$radius-sm` inner/nested, `$radius` controls, `$radius-lg` containers, `$radius-xl` hero only — near-square even px (2 / 4 / 6 / 8) on the drawings' pixel grid. No pills, no circles on controls. Artwork takes none; avatar silhouettes use `$avatar-round` so `--rounded` stays distinct from `--square`.
- **Depth is three rungs only:** `$shadow-1` (framed drawing at rest), `$shadow-2` / `$shadow-2-up` (floating chrome, two Y directions), `$shadow-press` (the offset under a control).

## Tilt

- **`wonk()` in [`_wonk.scss`](../src/styles/mixins/_wonk.scss)** tilts a card by alternating `:nth-child` (`$wonk-chrome`, 0.6°) and counter-tilts any `.art-frame` inside (`$wonk-art`, 1.5°). It straightens with a lift on `:hover` / `:focus-within`, halves under `$bp-mobile` (that rule must stay above the straighten rule, or mobile cards never level) and under reduced motion drops only the transition. `$art: null` for a card with no drawing.
- **Deterministic, never random** — the server re-pushes state on every join, vote and submission, which would re-roll a random angle.
- **Standalone `rotate` / `translate`, never `transform`** — the press owns `transform`.
- **The avatar lean:** `$wonk-avatar` (4° — 0.6° is invisible at 24–28 px) leans the chip inside `PlayerTag`. Direction comes from the player's **initial** via `LEANS` in [`seats.ts`](../src/lib/player/seats.ts) (`±1`, `±0.55`), not seat parity — rows already alternate by seat, so the letter adds an independent signal and a player leans the same everywhere. Only the multiplier crosses into TypeScript (`--seat-lean`). Exported images carry no wonk: the share card draws its chip upright.
- The lean is scoped to `.player-tag .avatar`, so the shape picker stays square (leaning swatches read as broken). Hover straightens it after 250 ms, with the delay on `:hover` only so leaving flops it back instantly.

## Backdrop

- **[`_backdrop.scss`](../src/styles/base/_backdrop.scss) is two coupled rules:** `html` carries `$bg`; `body` stays transparent; `body::before` is a fixed, `pointer-events: none` vignette at `z-index: -1`. That layer paints behind its own element's background, so **any background on `body` buries it.** Don't split the pair.
- `position: fixed`, not `background-attachment: fixed` (broken on iOS Safari). A pseudo-element because `App.vue` has no shared root. Decorative only — it never reaches the canvas, which stays opaque `$paper`.

## Players: seats, avatars and tags

### Seat colour

- **A player's colour is their seat.** `seatFor(seat, player)` in [`seats.ts`](../src/lib/player/seats.ts) is the only way to turn a player into a chip (colour, initial, face seed, shape, lean). What a seat is and why it's stable: [`architecture.md`](./architecture.md).
- **No colour hex in TypeScript.** `$player-colours` (in `_tokens.scss`) is emitted by a loop in `main.scss` as `--player-colour-N`, and `$accent` / `$ink-on-colour` as `--accent-fill` / `--ink-on-colour` for the share card's canvas; a `Seat` holds only the `var()` reference.
- **`$player-colours` is generated:** 21 hues at uniform OKLCH L = 0.72, chroma ≤ 0.20, in **golden-angle order** so consecutive seats sit ~137° apart. **Sorting it by hue ruins that.** It reuses no accent (lime = chosen, purple = GM, orange = warn, red = error).
- **Retune only at uniform lightness** — that's what gives every seat ≥ 7:1 against `$ink-on-colour` (white fails all 21) and keeps lime and the reds distinct from any seat.

### `Avatar.vue`

- **[`Avatar.vue`](../src/components/elements/Avatar.vue) is the only writer of `.avatar` markup** (used by `PlayerTag`, `AvatarPicker` and `NameField`'s preview). Always `aria-hidden` — a name or control label is always beside it.
- **Size:** 28 px; `--sm` 24 px. **`--sm` carries no `border-radius`** — it would tie with every shape at one class, so reordering [`_avatar.scss`](../src/styles/components/_avatar.scss) would flatten them; `.avatar--sm.avatar--rounded` scales the radius at two classes. **No margin** — spacing is `PlayerTag`'s `gap`.
- **Twelve silhouettes** (two even rows in the six-column picker): `--rounded` (also the fallback), `--square`, `--circle`, `--hexagon`, `--octagon`, `--leaf`, `--pixel`, `--ticket`, `--pebble`, `--blob`, `--shield`, `--stamp`. **Only shapes that hold a centred face at 24 px** — a diamond or star crushes it. **Trap:** [`chip.ts`](../src/lib/export/chip.ts) redraws them for the share card's canvas, so a silhouette changed or added here must change there too.
- **No seat yet → `$avatar-blank`** (themed). It must edge against `$surface` at 3:1 — the silhouette is all that tells picker options apart — and carry the dark face. Never lime (reads as selected), never `$paper` (too close to the light surface); the one lime chip is on a Paint share card, outside the UI. **Ink is `$ink-on-colour`, never white.**
- **The face is a CSS mask:** `mask-image` on a box filled with `currentColor`, so the lines take the chip's ink and follow the theme. That's why [`face.ts`](../src/lib/player/face.ts) renders with a transparent background and paper — anything opaque floods the chip (`test/face.test.ts` guards it). Until it loads, or if it fails, the chip shows the initial. Generation and seeding: [`architecture.md`](./architecture.md).

### `PlayerTag`

- **Every chip-beside-a-name is [`PlayerTag.vue`](../src/components/elements/PlayerTag.vue)** — lobby roster, "waiting for …" line, Results hero, the Best/Funniest awards, gallery and no-show list. Never hand-roll the pair. The one exception is the share card, which can't mount a component and draws the same pair on its canvas.
- **Its invariant:** the chip is `aria-hidden` because a name is always beside it. Don't add a chip-only flag.
- It owns the chip, gap and name font-family; the host sets size and weight. `size` sets only the chip: `row` (28 px) or `inline` (24 px, default). `--inline` centres the chip while the name keeps the baseline.
- **Traps:** `<PlayerTag>` without an import renders nothing and neither `vue-tsc` nor ESLint notices. `--truncate` needs `max-width: 100%` — an `inline-flex` box is shrink-to-fit and ignores its container.
- **Never render an avatar in VOTING** — that gallery is deliberately anonymous.

## Exports

- **The share card follows the viewer's theme** ([`card.ts`](../src/lib/export/card.ts)): `--bg` behind, `--fg` / `--fg-60` text, both panels on `--paper` with a 1px `--canvas-edge` outline (the app's frame), the wordmark in brand lime with the light theme's olive drop. The logo reads as `Logo.vue` does: PIX/MALER, then the four-square mark at about 0.4× the type. Landscape grids stack, square and portrait ones sit side by side, target first; a 32px gap separates the art from the footer, the URL sits on its own line under the name, and the panel scale is the largest integer that keeps the long edge within 1600 px.
- **The footer carries the player's tag as `PlayerTag` draws it**, upright: the seat chip ([`chip.ts`](../src/lib/export/chip.ts): the same 12 silhouettes, the face in `--ink-on-colour`) beside the name. Paint has no seat, so its chip is brand lime.
- **The share click never waits on loading.** The chip uses the face only if the generator has already loaded (RESULTS always has it; Paint warms it on open), otherwise the initial. Canvas text waits for `document.fonts.load`, but a font that fails to load leaves the card in a system face rather than failing it.
- **Names are cut to the card's width** with an ellipsis, only between whole visible characters, so a joined emoji (👨‍👩‍👧, 👍🏽) never breaks.

## Shared components

### `NameField`

- **Both name sites — `NameGate` and the lobby rename — use [`NameField.vue`](../src/components/elements/NameField.vue):** labelled input, dice randomise (a word-pair), placeholder `a nickname is enough`. A pseudonym is one tap away, so a real name is never the easy path.
- **Binding `shape` adds the avatar:** a live preview before the input (`seed`, `colour`; `$avatar-blank` unset) and an **Avatar shape** accordion holding `AvatarPicker`, its header showing the current shape. `shapesOpen` starts it expanded (`NameGate` sets it; the Lobby doesn't). Commit timing per site: [`architecture.md`](./architecture.md).
- **The accordion region names the picker**, so `AvatarPicker` has no group label — one would be announced twice. The accordion heading is an `h2`, so `NameGate` adds an `sr-only` `h1` ("Pick a name and avatar"): `RoomInterstitial` renders no heading.
- **`inheritAttrs: false` + `v-bind="$attrs"` on the `<input>`** routes `autofocus`, `@blur`, `@keydown` there — and **`class` too**, so wrap it for layout (Lobby's `.lobby__name`).

### `RoomInterstitial`

- The name gate and the four refusals (room full, no such room, room closed, already open in another tab) share [`RoomInterstitial.vue`](../src/components/layout/RoomInterstitial.vue): wordmark, eyebrow, the room code (read off the URL once, exposed to the slot as `code`), then a slot for the body. Styled by `.room-screen` (`_room-interstitial.scss`).
- **The shape is also the `interstitial` mixin** ([`_screen.scss`](../src/styles/mixins/_screen.scss)) because `PhaseBoundary`'s fallback must render it *without* mounting a component — a fallback that can throw is worse than none.

### `SettingsMenu`

- [`SettingsMenu.vue`](../src/components/layout/SettingsMenu.vue) is the one gear: in `PhaseLayout`'s bar (room phases, `/paint`) and as `settings-menu--corner` on Entry. A disclosure, not `role="menu"`: outside pointer or Escape closes it; Escape returns focus to the gear.
- **Flat dropdown:** Theme, then two `<section>`s with an `h2` each — **Accessibility** (text size, touch mode, keyboard shortcuts — hidden in touch mode) and **Sound** (music, sound effects). Rows are a Sentence-case label (`$fg-80`, never an uppercase eyebrow) and a control; a setting whose name doesn't explain itself gets a one-line `__hint` wired via `ToggleSwitch`'s `describedby`.
- Footer: text links **Privacy** and **Credits** (the global `InfoModal`), **Clear my data**, and the client version.

### Picker field recipe

- `ImagePicker`'s **Adjust target** step has two groups — **Framing** (shape, crop frame, crop size) and **Look** (style, detail, colours, alpha) — each `<section class="picker__group">` with an `h3.picker__group-title` under the accordion's `h2`.
- **Every control is a `.picker__field`:** `__field-head` (`__field-label` left, optional `__field-value` right in `$muted`), the control (sliders and selects take `__field-control`, capped at `$measure`, 20rem; segmented groups keep their width), optional `__field-hint`. Game settings (Draw time, Music) uses it too.
- **The Image step's samples** scroll in one bordered box (`__sample-scroll`, 20rem cap), grouped under lowercase category eyebrows (`__sample-group-title`). Tiles are thumbnail-only (the `alt` is the title); the info line below (`__sample-info`, two lines reserved so hovering doesn't shift the layout) names the hovered, focused or selected work as title, then `artist · year · origin · Source`. The same label (`SampleCaption`) sits under the crop frame in Adjust target while a sample is loaded; an upload gets none.
- **Spacing tiers:** 8 px within a field, 16 px between fields, 32 px between groups with a `$border-soft` hairline.
- Under `$bp-mobile` a `compact` `TargetPreview` sits by the Look heading — the hosts' `overflow: auto` wrappers defeat the sticky desktop preview. The crop hint follows touch mode; style help is a `Disclosure variant="link"`.

## Styling mechanics

- **Static styles live in global partials** under `src/styles/` (`foundation/`, `base/`, `components/`, `screens/`), `@use`d into [`main.scss`](../src/styles/main.scss) in dependency order, by bare name (sass `loadPaths` in `vite.config.ts`).
- **`main.scss` order has traps:** `theme` first; `tagline` before the page partials (hosts tie with `.tagline` at one class); `player-list` after `buttons`.
- **Recipe partials emit no CSS.** `mixins/_chrome`, `_wonk` and `_screen` hold only mixins and variables and are `@use`d by their includers, never by `main.scss` — a rule in one would land at its first `@use` and reorder the cascade.
- **Breakpoints are tokens:** `$bp-mobile` (640px) and `$bp-tablet` (1024px), each a `max-width` meaning "this size and smaller".
- **A component `<style>` block needs a scoping reason** — in the app, `DrawBoard.vue` (`:deep()` into imperatively mounted canvases) and `GameIcon.vue`'s one SVG rule; the dev-only `Components.vue` and `Quantise.vue` scope theirs so they tree-shake out. Everything else is a partial.
  - Imperative DOM needs no `:deep()` from a partial — an unscoped descendant selector reaches it (`.art-surface > canvas`, `.tools-panel .swatch*`).
  - **Check scope-id inheritance before moving a scoped rule out.** A child's root inherits its parent's scope id, so a bare selector in a scoped block may rely on it to stay local. The fixed DRAWING / VOTING / `/paint` shell is the explicit `.phase--fixed` class for this reason.
  - Scoping raises specificity and can block host overrides (why `Tagline` lives in `_tagline.scss`).
  - `::view-transition-*` can't be scoped.
