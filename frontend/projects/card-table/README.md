# `card-table` — a reusable card animation module

A self-contained, game-agnostic module for the visual half of a card game: **selecting, playing,
dealing, and animating cards onto a discard pile**, plus the zones a game adds — other players' face-down hands, a stock, melds. It knows
nothing about rules, turns, scoring, boards, or pawns — a host game drives it imperatively and
supplies its own geometry through one small seam.

It was extracted from the Keezen/Tock board game but carries no Keezen specifics; the goal is to drop
it into a future card game and reuse the whole "hand → play → fly → pile" experience.

---

## Design in one picture

![A UML class diagram: your game component creates and drives a CardTable and binds a CardLayer, which holds that table and owns the Card components it draws. The CardTable uses a CardTableConfig, whose optional TableLayout gives a ZoneLayout for the hand, pile and deck, and it owns its Zones, each laid out by a ZoneLayout.](docs/architecture.svg)

How to read it (UML): a **dashed arrow** means "depends on", and its «label» says how; a **solid
arrow** means "holds a reference to", with the name and how many (`1`, `0..1`, `*`) at its head; a
**filled diamond** means "owns". Each box lists one member per line: attributes, then operations.

The picture is generated: change `docs/architecture.data.mjs` and run `npm run diagrams`. CI fails
when the SVG no longer matches it.

- **`CardTable`** — the engine. A framework-light class (Angular signals, **no template**) that owns
  the zones (the pile, the deck and any the game adds), the in-flight "flyer" layer and the deal-in
  animation state, and computes every card's on-table position. Unit-testable like a plain state machine.
- **`<app-card-layer>`** — a dumb, `OnPush` presentational component. It renders whatever the engine
  computes and raises click/hover events. No game logic.
- **`TableLayout`** — the seam. Your game decides _where_ cards live: the hand fan, the pile stack and
  the deck, each a zone layout. `DEFAULT_LAYOUT` ships a sensible linear-fan + spiral-pile layout.
- **`<app-card>`** — one playing card, drawn from a sprite sheet (bundled `card-deck.png` by default,
  swappable per game).

---

## Folder contents

The sources live in `src/lib/`; `src/public-api.ts` is what a game can import.

| File                        | What it is                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `card-table.ts`             | The `CardTable` engine (signals + `cards` computed + animation methods).                                         |
| `card-table.types.ts`       | `CardTableConfig`, `CardFace`, `Pos`, `Zone`, `ZoneLayout`, `TableLayout`, `CardVM`, `Flyer`, `CardTableTiming`. |
| `timing.ts`                 | `DEFAULT_TIMING` — the out-of-the-box animation timings.                                                         |
| `default-layout.ts`         | `DEFAULT_LAYOUT` — a ready-made hand-fan + spiral-pile layout, with the deck on the pile.                        |
| `card-layer.ts/.html/.scss` | The `<app-card-layer>` presentational component.                                                                 |
| `card/card.ts/.html/.scss`  | The `<app-card>` sprite component.                                                                               |
| `card/card-deck.png`        | The default sprite sheet (13 cols × 5 rows).                                                                     |
| `card-table.spec.ts`        | Engine unit tests (deal / play / pile / trade lifecycle).                                                        |

---

## Quick start

```ts
import { CardLayer, CardTable } from 'card-table';

@Component({
  imports: [CardLayer /* … */],
  template: `
    <div class="play" style="--hand-top: 70%">
      <app-card-layer
        [table]="table"
        [selectedUuid]="selectedUuid()"
        [isSpecial]="isSpecial"
        (cardClick)="onCardClick($event)"
        (cardHover)="onCardHover($event)"
      />
    </div>
  `,
})
export class MyGame {
  // 1. Give the engine your hand (a signal of CardFace[]); the layout defaults to DEFAULT_LAYOUT.
  protected readonly table = new CardTable({ hand: () => this.hand() });

  // 2. Which card values get the "special" highlight (your rules decide).
  protected readonly isSpecial = (value: number) => value === 1 || value === 13;

  // 3. Drive it from your own server/state diffing:
  onDealt(newUuids: number[]) {
    this.table.dealIn(newUuids);
  }
  onIPlayed(card: CardVM) {
    this.table.flyToPile(card, { pop: true });
  }
  onNewRound() {
    this.table.clearPile();
  }
}
```

That's the whole contract: **feed it the hand (and, if you like, a layout), render `<app-card-layer>`, and call
the four methods when your game state changes.**

### Tuning the feel

Give the config a `timing` (all fields optional) to retune the animations; the rest fall back to
`DEFAULT_TIMING`. Card _sizes_ are not timings: they belong to the layout, as each slot's `scale` (a
slot without one is a full-size card).

```ts
new CardTable({ hand: () => this.hand(), timing: { flyMs: 350, dealStaggerMs: 500 } });
```

| Option          | Default | Meaning                                                                |
| --------------- | ------- | ---------------------------------------------------------------------- |
| `flyMs`         | `500`   | Fly-to-pile duration (drives the CSS transition + flip keyframes too). |
| `popMs`         | `180`   | How long the own card swells + glows before it flies.                  |
| `dealFlipMs`    | `550`   | Dealt-card turnover as it fans out.                                    |
| `dealStaggerMs` | `700`   | Stagger between dealt cards.                                           |
| `tradeRevealMs` | `560`   | When a traded-in card is unmasked (relative to its flyer launch).      |
| `popScale`      | `1.2`   | Own-card swell during the pop beat.                                    |

The table runs with these as `table.timing`. `<app-card-layer [table]>` publishes them as CSS vars
(`--ct-fly-ms`, `--ct-pop-ms`, `--ct-deal-flip-ms`), with the size of a card on the deck as
`--ct-deck-scale`, so the engine's `setTimeout`s and the SCSS transitions/keyframes **stay in sync
from one source**.

---

## The seams (what a host game provides)

| Seam                | How                                                     | Purpose                                                                 |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Hand**            | `new CardTable({ hand: () => this.hand() })`            | A `Signal<CardFace[]>` (or getter) of the viewer's cards.               |
| **Layout**          | the config's `layout`, a `TableLayout`                  | Where the hand fan, pile stack and deck sit — see below.                |
| **Zones**           | `table.defineZone({ id, layout, faceDown? })`           | Where else cards lie: other players' face-down hands, a stock, melds.   |
| **Highlight**       | `[isSpecial]` input                                     | Which card _values_ get the gold "special" ring (your rules).           |
| **Selection**       | `[selectedUuid]` input                                  | The lifted/ringed card (your selection state).                          |
| **Vertical offset** | `--hand-top` CSS var (default `0`)                      | How far down your box the layer's square starts — see below.            |
| **Sprite sheet**    | `--card-sheet` / `--card-cols` / `--card-rows` CSS vars | Swap in a different deck image + grid.                                  |
| **Own faces**       | `[face]` input — an `<ng-template let-face>`            | Draw fronts yourself instead (tiles): given each card's `suit`/`value`. |
| **Piece shape**     | `--card-width` / `--card-aspect` CSS vars               | Pieces that are not card-shaped — wider, squarer tiles.                 |

### `TableLayout`

```ts
type ZoneLayout = (index: number, count: number) => Pos; // where the index-th of count cards sits

interface TableLayout {
  hand: ZoneLayout; // fanned hand
  pile: ZoneLayout; // stacked pile — its slots carry the pile size (scale) and stacking (z)
  deck: ZoneLayout; // mid-table: cards are dealt from it at its size, and played back to it
}
```

A zone's layout hands out its **slots**: the place (`Pos`) where each of its cards lies — where, how
tilted, how big, and stacked how high. The built-in zones are laid out exactly like the zones a game
adds with `defineZone`. All
coordinates are in **the card-layer's own percentage space** (`x`/`y` are `%` for `left`/`top` of
the layer box). Give your own as the config's `layout` to match your board; without one the table
uses `DEFAULT_LAYOUT`. To aim an animation of your own, ask the table rather than keeping a copy of
the layout: `table.positionOf(uuid)` for where a card lies, `table.nextPositionIn(zoneId)` for where
one added to a zone would land. Fly-in
_origins/targets_ for a trade (a partner's fan) are passed straight into `tradeSwap`, with the size of
a card there as their `scale`, because they're your board geometry, not table layout.

### The sprite sheet

`<app-card>` draws one cell of a grid. `suit` selects the row, `value` selects the column
(`--card-col` = `value - 1`, so `value` is 1-based: ace = 1). To use a different deck, set on any
ancestor:

```css
.my-game {
  --card-sheet: url('/assets/my-deck.png');
  --card-cols: 13; /* columns in the sheet */
  --card-rows: 4; /* rows in the sheet    */
}
```

The default `card-deck.png` is a component-relative asset, so the bundler hashes it and it resolves
under any `<base href>` — no app-level wiring needed.

### Your own faces and shape

A game whose pieces no sprite sheet holds — Rummikub's tiles — draws their fronts itself. Pass an
`<ng-template>` as `[face]`; it is given each face-up card and flyer as `{ suit, value }` (typed
`FaceContext`), and the sprite is not drawn. Backs stay the library's own. Pieces of another shape
set their size on the layer: `--card-width` (a share of the board, default `16.667%`) and
`--card-aspect` (default `100 / 155.73`, a sprite cell's).

```html
<ng-template #tile let-face>
  <span class="tile" [class]="colours[face.suit]">{{ face.value }}</span>
</ng-template>
<app-card-layer
  [cards]="table.cards()"
  [face]="tile"
  style="--card-width: 9%; --card-aspect: 3 / 4"
/>
```

---

## API reference

### `CardTable` (engine)

| Member                                    | Type                        | Notes                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `constructor({ hand, layout?, timing? })` | —                           | A `CardTableConfig`. `hand`: a `Signal<CardFace[]>` or getter; `layout`: a `TableLayout` (default `DEFAULT_LAYOUT`); `timing`: a `CardTableTiming` (default `DEFAULT_TIMING`).                                                                                                                   |
| `timing`                                  | `Required<CardTableTiming>` | The timings it runs with: `DEFAULT_TIMING`, with whatever the config retuned.                                                                                                                                                                                                                    |
| `pile`                                    | `signal<CardFace[]>`        | Cards resting on the discard pile.                                                                                                                                                                                                                                                               |
| `flyers`                                  | `signal<Flyer[]>`           | Cards mid-flight (transient).                                                                                                                                                                                                                                                                    |
| `cards`                                   | `computed<CardVM[]>`        | Every card (hand, pile and every zone) with a target position — what the layer draws.                                                                                                                                                                                                            |
| `dealing`                                 | `computed<boolean>`         | True while a deal-in animates (sync your own dealt visuals).                                                                                                                                                                                                                                     |
| `stacked`                                 | `computed<boolean>`         | True on the first frame of a deal (cards still at the deck).                                                                                                                                                                                                                                     |
| `positionOf(uuid)`                        | method                      | Where a card lies at rest (`Pos`), in whichever zone holds it — `undefined` when it is not on the table. For aiming your own animations at a card, e.g. `tradeSwap`'s received card.                                                                                                             |
| `nextPositionIn(zoneId)`                  | method                      | Where a card added to a zone would land (`Pos`): after its last card, or the zone's one place when it is empty (Keezen's deck).                                                                                                                                                                  |
| `defineZone(zone)`                        | method                      | Add a zone the table holds cards in. A `faceDown` zone draws backs only; its cards ignore the mouse and are never marked special.                                                                                                                                                                |
| `place(card, zoneId)`                     | method                      | Move a card into a zone (out of any other); it transitions there, turning over when it goes between face-down and face-up. The card carries its face, so a card leaving a face-down zone can reveal it.                                                                                          |
| `deal(cards, { from?, into?, delayMs? })` | method                      | Deal cards one after another from a zone (default the built-in `deck`) into another (default the hand). Each starts at its own slot in `from`. Deals may overlap; `delayMs` shifts one back, for a round-robin.                                                                                  |
| `dealIn(uuids)`                           | method                      | Kick off the deal-in FLIP for freshly dealt card uuids.                                                                                                                                                                                                                                          |
| `flyToPile(card, opts?)`                  | method                      | Fly a card (own play `{pop:true}` / opponent `{flip:'in',startScale}`) to the pile. The card carries its id + face + start slot; a faceless card (no `uuid`) lands with a synthetic id. A hand card is masked while its flyer is up and snaps onto the pile on landing, so it never flies twice. |
| `tradeSwap(partner, gave, got)`           | method                      | Two-way swap between the viewer's hand and a partner fan (masks the received card until its flyer lands).                                                                                                                                                                                        |
| `clearPile()`                             | method                      | Empty the pile (a new round).                                                                                                                                                                                                                                                                    |

### `<app-card-layer>` (component)

**Inputs:** `table: CardTable` (required — the layer draws its cards and flyers and publishes its
timing CSS vars), `face: TemplateRef<FaceContext> | null`, `selectedUuid: number | null`,
`isSpecial: (value: number) => boolean`.
**Outputs:** `cardClick: number` (uuid), `cardHover: number | null` (value) — never for a face-down card.

The built-in zone ids are exported as `HAND_ZONE`, `PILE_ZONE` and `DECK_ZONE`.

---

## Coordinate system

The layer is `display: contents`: what it draws is a **square** that is positioned inside whatever
box you place it in. Give that box `position: relative` (or absolute), and set `--hand-top` on it
if the square should start lower down:

- The square is as wide as your box, and as tall as it is wide (`aspect-ratio: 1`).
- Its top edge sits `--hand-top` below the top of your box. Any CSS length works — `0`, `70%`,
  `calc(0.12 * var(--board-w))`. Unset, it is `0`: the square starts at the top of your box.
- All engine/layout `x`/`y` are percentages of that square, and a card's `x`/`y` is its centre.
  So `{ x: 50, y: 50 }` is the middle of the square, and `y` above 100 lies below it.
- Cards are not clipped. A hand laid out below the square (Keezen's sits at `y: 116`) spills into
  your box under it, so leave room there, e.g. with padding.

Keezen, for example, overlays the square on its 600px board. It sets `--hand-top` to the height of
the strip above the board (the top opponent's fan), reserves the strip below for the hand, and its
layout divides board pixel coordinates by 6 to reach `%`.

---

## What it deliberately does **not** include

- **Game rules** — legal moves, turn order, scoring, must-play, etc.
- **Board / pawn** rendering and movement — a different concern; keep it in your game.
- **Board geometry** — where each seat's fan sits on _your_ board. You give each zone its `layout`
  and compute fly-in origins; the module just renders and animates them.
- **Server/state wiring** — you diff your own game state and call the engine's methods.

---

## Porting checklist

1. Render `<app-card-layer [table]="table">` inside a positioned box (setting `--hand-top` if the
   square should start below its top).
2. Construct `new CardTable({ hand: () => yourHandSignal() })`. That uses `DEFAULT_LAYOUT`; give
   your own `layout` if your table isn't a linear fan + central pile.
3. Map your cards to `CardFace { uuid, suit, value }` (stable `uuid`; `suit` = sprite row,
   `value` = 1-based sprite column).
4. Point `--card-sheet` / `--card-cols` / `--card-rows` at your deck (or reuse `card-deck.png`).
5. Call `dealIn` on a deal, `flyToPile` when a card is played, `tradeSwap` for a swap, `clearPile`
   on a new round. Give other players' hands a `faceDown` zone each and move their cards with
   `deal`/`place`; feed `[isSpecial]`/`[selectedUuid]` for highlights.

---

## Known couplings & tuning notes

- **Timing is single-sourced.** All durations live in the `timing` (`CardTableTiming`); the engine uses the
  numbers for its `setTimeout`s and `<app-card-layer>` publishes them as CSS vars, so the SCSS
  transitions (`card-layer.scss`) and flip keyframes (`card/card.scss`) follow automatically. Change
  a value in one place (the timing) and both TS and CSS update. Only the internal `LAND_BUFFER_MS`
  (how long after the flight the flyer swaps to a pile element) and `DEAL_CLEAR_BUFFER_MS` are fixed.
- **Deck size ↔ card back.** The card `.back` border widths are `calc(2px / var(--ct-deck-scale))`,
  where `--ct-deck-scale` is the deck layout's `scale`, so a back stacked at the deck keeps a 2px
  border at any deck size. Backs in a face-down fan are drawn at that zone's own scale; Keezen's fans
  and deck are both 0.3, so they match.
- **Selector prefix.** Components use the app's `app-` selector prefix. If you publish this as a
  standalone library, give it a library-specific prefix instead.
- **Writable `pile` signal.** `pile` is exposed writable for the rare no-animation land
  (`pile.update(...)`) and for tests; treat it as read-mostly and prefer the methods.
