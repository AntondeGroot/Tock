import { Signal } from '@angular/core';

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

/**
 * What a game's own face template is given to draw a card's front — `let-face` in an
 * `<ng-template>` passed to `<ct-card-layer [face]>`. Without one, fronts come from the sprite.
 */
export interface FaceContext {
  $implicit: { suit: number; value: number };
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
  layout: ZoneLayout;
}

/** Where a zone's `index`-th of `count` cards sits — its place, tilt, size and stacking. */
export type ZoneLayout = (index: number, count: number) => Pos;

/**
 * Where the zones every table has lie — the game-specific layout. The deck stands mid-table: cards
 * are dealt from it, at its size, and played cards fly back to it before settling on the pile.
 */
export interface TableLayout {
  /** The viewer's hand. */
  hand: ZoneLayout;
  /** The pile cards are played onto; its slots carry the size of a card lying there. */
  pile: ZoneLayout;
  /** Where cards are dealt from; its slot carries the size of a card stacked there. */
  deck: ZoneLayout;
}

/** What a game sets a table up with — only its hand is required. */
export interface CardTableConfig {
  /** The viewer's cards, as the game reports them: a signal or a getter. */
  readonly hand: Signal<CardFace[]> | (() => CardFace[]);
  /** Where the hand, pile and deck lie; {@link import('./default-layout').DEFAULT_LAYOUT} if left out. */
  readonly layout?: TableLayout;
  /** Timings to retune; {@link import('./timing').DEFAULT_TIMING} fills the rest. */
  readonly timing?: CardTableTiming;
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
 * Tunable timings (ms) and the pop beat for the table animations — the single source of truth shared by
 * the engine (its setTimeouts) and the layer (which publishes them as CSS vars so the transitions
 * and keyframes stay in sync). All optional; {@link import('./timing').DEFAULT_TIMING} fills the
 * rest.
 */
export interface CardTableTiming {
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
  /** How much the own-play card swells during the pop beat (scale). */
  popScale?: number;
}

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
