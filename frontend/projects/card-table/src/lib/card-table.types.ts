/**
 * Shared types for the reusable card-table module. All coordinates are in the card-layer's own
 * percentage space (the layer is overlaid on the play area; x/y are `%` for `left`/`top`).
 */

/** A face-up card: a stable identity plus what to draw (suit row, value column of the sprite). */
export interface CardFace {
  uuid: number;
  suit: number;
  value: number;
}

/** A position on the table. rot (deg), scale and z are optional; the engine supplies defaults. */
export interface Pos {
  x: number;
  y: number;
  rot?: number;
  scale?: number;
  z?: number;
}

/**
 * A place on the table that holds cards in order: a hand, a pile — and in other games a meld, a
 * stock or a rack. The zone decides where its `index`-th of `count` cards sits.
 */
export interface Zone {
  readonly id: string;
  /** Its cards lie face down — an opponent's hand, a stock: the table draws only their backs. */
  readonly faceDown?: boolean;
  layout(index: number, count: number): Pos;
}

/**
 * Where cards go — the one game-specific seam. A game provides the layout (hand fan, pile stack,
 * and the central deck/pile anchor); origins/targets for fly-ins (an opponent's fan, a trade
 * partner) are passed straight into the engine's flyer methods, so they don't live here.
 */
export interface CardPositioner {
  /** Slot for the `index`-th of `count` cards in the viewer's hand. */
  handSlot(index: number, count: number): Pos;
  /** Slot for the `index`-th card on the discard pile (includes its scale + z). */
  pileSlot(index: number): Pos;
  /** The pile's centre — where flyers land and where dealt cards fly out from. */
  pileCenter(): Pos;
}

/** A rendered card in the layer: geometry only. The game overlays `selected`/`special` in the view. */
export interface CardVM {
  uuid: number;
  suit: number;
  value: number;
  /** The zone the card is in — `hand`, `pile`, or one the game defined. */
  zoneId: string;
  /** Drawn with its back up, because its zone is face down. */
  faceDown: boolean;
  inPile: boolean;
  x: number;
  y: number;
  rot: number;
  scale: number;
  z: number | undefined;
  dealDelay: number;
  dealing: boolean;
  hidden: boolean;
  /** Placed without a transition this frame — a card whose flyer just landed it on the pile. */
  snap: boolean;
  /** Turning over as it moves: `in` coming face up, `out` going face down. */
  flip: 'in' | 'out' | null;
}

/**
 * Tunable timings (ms) and scales for the table animations — the single source of truth shared by
 * the engine (its setTimeouts) and the layer (which publishes them as CSS vars so the transitions
 * and keyframes stay in sync). All optional; {@link import('./card-table').DEFAULT_CARD_TABLE_OPTIONS}
 * fills the rest.
 */
export interface CardTableOptions {
  /** How long a card flies to the pile — the CSS transition + flyer flight (ms). */
  flyMs?: number;
  /** How long the viewer's own card swells + glows before it flies (ms). */
  popMs?: number;
  /** How long a dealt card turns over as it fans out (ms). */
  dealFlipMs?: number;
  /** Round-robin stagger between dealt cards (ms). */
  dealStaggerMs?: number;
  /** When a traded-in card is unmasked, relative to its flyer launch (ms). */
  tradeRevealMs?: number;
  /** Card scale on the pile (1 = full hand size). */
  pileScale?: number;
  /** Card scale while stacked at the deck during a deal. */
  deckScale?: number;
  /** Card scale in another player's fan. */
  fanScale?: number;
  /** How much the own-play card swells during the pop beat (scale). */
  popScale?: number;
}

/** The options with every field filled in — what {@link import('./card-table').CardTable} exposes. */
export type ResolvedCardTableOptions = Required<CardTableOptions>;

/** A transient card flying across the table (an opponent's play, a trade swap, a forfeit discard). */
export interface Flyer {
  id: number;
  x: number;
  y: number;
  rot: number;
  scale: number;
  suit: number;
  value: number;
  flip?: 'in' | 'out';
  glow?: boolean;
}
