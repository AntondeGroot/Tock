import { computed, signal, Signal } from '@angular/core';
import {
  CardFace,
  CardPositioner,
  CardTableOptions,
  CardVM,
  Flyer,
  Pos,
  ResolvedCardTableOptions,
  Zone,
} from './card-table.types';
import { TableFrame, toCardVM } from './card-view';
import { HAND_ZONE, PILE_ZONE, placeCards } from './zone-layout';

/** The out-of-the-box timings + scales. A game overrides any subset via the constructor options. */
export const DEFAULT_CARD_TABLE_OPTIONS: ResolvedCardTableOptions = {
  flyMs: 500, // fly-to-pile duration (also the CSS transition + flip keyframes)
  popMs: 180, // own-card swell/glow hold before it flies
  dealFlipMs: 550, // dealt-card turnover as it fans out
  dealStaggerMs: 700, // round-robin stagger between dealt cards
  tradeRevealMs: 560, // unmask a traded-in card a frame before its flyer lands
  pileScale: 0.6, // pile card size vs full hand size
  deckScale: 0.3, // deck-stack size while dealing
  fanScale: 0.3, // size in another player's fan
  popScale: 1.2, // own-card swell during the pop beat
};

// The flyer lands (swaps to a pile element) this long AFTER its flight visually ends, so the card
// is fully settled at the pile before the hand-off — avoids a one-frame jump. Not tunable.
const LAND_BUFFER_MS = 100;
// Extra slack after the last dealt card's flight before the deal-in state is cleared.
const DEAL_CLEAR_BUFFER_MS = 2000;

/**
 * The reusable card-table engine: it owns the discard pile, the transient flyer layer and the
 * deal-in state, and computes each card's on-table position (hand fan / pile / deck) so the same
 * DOM element animates between them (a FLIP). Framework-light — Angular signals, no template — so
 * it can be unit-tested like a plain state machine.
 *
 * A game drives it imperatively: it supplies the current hand (a signal), a {@link CardPositioner}
 * and optional {@link CardTableOptions}, then calls {@link dealIn}/{@link flyToPile}/{@link
 * tradeSwap}/{@link clearPile} from its own state-change detection. A dumb `<app-card-layer>`
 * renders {@link cards} + {@link flyers} and publishes {@link options} as CSS timing vars.
 */
export class CardTable {
  /** The resolved timings + scales (defaults merged with the constructor overrides). */
  readonly options: ResolvedCardTableOptions;
  // Cards played onto the pile, kept here so the same element can fly there and then persist. Own
  // cards land with their real uuid; cards flown in from opponents get a synthetic negative uuid.
  readonly pile = signal<CardFace[]>([]);
  // Transient face-up cards mid-flight (an opponent's play, a trade swap, a forfeit discard).
  readonly flyers = signal<Flyer[]>([]);

  // Hand cards masked while a flyer stands in for them: one flying in (the trade swap), so the real
  // card doesn't pop into its slot until the flyer lands on it, or one flying out to the pile.
  private readonly hiddenUuids = signal<Set<number>>(new Set());
  // Cards just landed on the pile by their flyer, placed there for one frame without a transition.
  private readonly snappedUuids = signal<Set<number>>(new Set());
  // Deal-in FLIP: `dealtIndex` maps each freshly dealt uuid to its stagger order; `atDeck` is true
  // for the first frame so those cards render stacked at the deck before fanning to their slots.
  private readonly dealtIndex = signal<Map<number, number>>(new Map());
  private readonly atDeck = signal(false);

  private flyerSeq = 0;
  private syntheticUuid = -1;

  constructor(
    private readonly hand: Signal<CardFace[]> | (() => CardFace[]),
    private readonly positioner: CardPositioner,
    options: CardTableOptions = {},
  ) {
    this.options = { ...DEFAULT_CARD_TABLE_OPTIONS, ...options };
  }

  private readonly handZone: Zone = {
    id: HAND_ZONE,
    layout: (index, count) => this.positioner.handSlot(index, count),
  };
  private readonly pileZone: Zone = {
    id: PILE_ZONE,
    layout: (index) => this.positioner.pileSlot(index),
  };

  /** One list of every card (hand + pile), each with a target position — the layer renders this. */
  readonly cards = computed<CardVM[]>(() => {
    // The pile is listed last, so a played card the hand still reports is laid out on the pile.
    // Its z follows PLAY ORDER (pile index), so the newest card is on top regardless of the DOM
    // order — which is sorted by uuid, so playing a card never reorders the list: only its target
    // changes, and the same element transitions cleanly every time.
    const placed = placeCards([
      { zone: this.handZone, cards: this.hand() },
      { zone: this.pileZone, cards: this.pile() },
    ]);
    const frame: TableFrame = {
      dealt: this.dealtIndex(),
      atDeck: this.atDeck(),
      deck: this.positioner.pileCenter(),
      hidden: this.hiddenUuids(),
      snapped: this.snappedUuids(),
      options: this.options,
    };
    placed.sort((a, b) => a.card.uuid - b.card.uuid);
    return placed.map((p) => toCardVM(p, frame));
  });

  /** True while a deal-in is animating — a game can sync its own dealt visuals (e.g. opponents). */
  readonly dealing = computed(() => this.dealtIndex().size > 0);
  /** True on the first frame of a deal, while dealt cards are still stacked at the deck. */
  readonly stacked = computed(() => this.atDeck());

  /** Kick off the deal-in FLIP for the given freshly-dealt card uuids. */
  dealIn(uuids: number[]): void {
    const order = new Map<number, number>();
    uuids.forEach((u, i) => order.set(u, i));
    this.dealtIndex.set(order);
    this.atDeck.set(true); // first frame: stacked at the deck
    // Release next frame so they transition out to their slots (staggered by delay).
    requestAnimationFrame(() => requestAnimationFrame(() => this.atDeck.set(false)));
    // Clear once the last card has finished (last round's delay + the transition).
    setTimeout(
      () => this.dealtIndex.set(new Map()),
      uuids.length * this.options.dealStaggerMs + DEAL_CLEAR_BUFFER_MS,
    );
  }

  /**
   * Fly `card` from its current slot to the pile centre, then drop the flyer and leave it on the
   * pile. The card is passed by identity (its uuid) and carries its own face + start position — a
   * captured hand card (own play/forfeit) or a faceless external card (an opponent's play/forfeit),
   * which has no uuid and is landed with a fresh synthetic id. Own plays pop; opponents flip in.
   *
   * The flyer is a copy, and the hand may go on showing the original — until the push drops it,
   * or for the whole pause when the move ended the round. So a hand card is hidden while its flyer
   * is up, keeping its slot so the rest of the fan stays put, and snaps onto the pile on landing:
   * that same element sliding over from the hand would fly the card a second time.
   */
  flyToPile(
    card: { uuid?: number; suit: number; value: number; x: number; y: number; rot?: number },
    opts: { startScale?: number; flip?: 'in' | 'out'; pop?: boolean } = {},
  ): void {
    const id = ++this.flyerSeq;
    const fromHand = card.uuid !== undefined;
    if (fromHand) this.hide(card.uuid!);
    const landCard: CardFace = {
      uuid: card.uuid ?? this.syntheticUuid--,
      suit: card.suit,
      value: card.value,
    };
    this.flyers.update((f) => [
      ...f,
      {
        id,
        x: card.x,
        y: card.y,
        rot: card.rot ?? 0,
        scale: opts.startScale ?? 1,
        suit: card.suit,
        value: card.value,
        flip: opts.flip,
        glow: opts.pop,
      },
    ]);

    const { flyMs, popMs, popScale, pileScale } = this.options;
    const flightMs = flyMs + LAND_BUFFER_MS; // land a beat after the flight visually completes
    const center = this.positioner.pileCenter();
    const flyToPile = () =>
      this.setFlyer(id, { x: center.x, y: center.y, rot: 0, scale: pileScale, glow: false });
    const land = () => {
      this.removeFlyer(id);
      this.pile.update((p) => [...p, landCard]);
      if (fromHand) this.snapIntoPlace(landCard.uuid);
    };

    if (opts.pop) {
      // Swell the card + glow (a "played!" beat), hold popMs, then fly to the pile.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.setFlyer(id, { scale: popScale })),
      );
      setTimeout(flyToPile, popMs);
      setTimeout(land, popMs + flightMs);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(flyToPile));
      setTimeout(land, flightMs);
    }
  }

  /**
   * Animate a two-way card trade between the viewer's hand and a partner's fan. The card you
   * `gave` leaves your hand, turns face-down and shrinks into the partner fan; the card you
   * `got` flies out of that fan as a back, turns over and grows into your hand `slot`. The
   * received card is masked until its flyer lands so it never shows in two places at once. The
   * game supplies only the three board positions (its geometry); the timing, scales, flips and
   * masking live here.
   */
  tradeSwap(
    partner: Pos,
    gave: { suit: number; value: number; from: Pos },
    got: { uuid: number; suit: number; value: number; to: Pos },
  ): void {
    const { fanScale, tradeRevealMs } = this.options;
    // Your card shrinks face-down into the partner's fan.
    this.flyTransient(gave.from, partner, gave, { fromScale: 1, toScale: fanScale, flip: 'out' });
    // The received card grows face-up out of the partner's fan into your hand; keep the real card
    // hidden while it flies, revealing it a frame before the flyer lands (they overlap, no gap).
    this.hide(got.uuid);
    setTimeout(() => this.reveal(got.uuid), tradeRevealMs);
    this.flyTransient(partner, got.to, got, { fromScale: fanScale, toScale: 1, flip: 'in' });
  }

  /** Fly a transient face-up card from one point to another (the moving parts of a trade swap). */
  private flyTransient(
    from: Pos,
    to: Pos,
    face: { suit: number; value: number },
    opts: { fromScale?: number; toScale?: number; flip?: 'in' | 'out'; onLand?: () => void } = {},
  ): void {
    const id = ++this.flyerSeq;
    this.flyers.update((f) => [
      ...f,
      {
        id,
        x: from.x,
        y: from.y,
        rot: 0,
        scale: opts.fromScale ?? 1,
        suit: face.suit,
        value: face.value,
        flip: opts.flip,
      },
    ]);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        this.setFlyer(id, { x: to.x, y: to.y, scale: opts.toScale ?? 1 }),
      ),
    );
    setTimeout(() => {
      this.removeFlyer(id);
      opts.onLand?.();
    }, this.options.flyMs + LAND_BUFFER_MS);
  }

  /** Patch a single in-flight flyer by id (position/scale/glow during a transition). */
  private setFlyer(id: number, patch: Partial<Flyer>): void {
    this.flyers.update((f) => f.map((fl) => (fl.id === id ? { ...fl, ...patch } : fl)));
  }

  /** Drop a flyer once it has landed. */
  private removeFlyer(id: number): void {
    this.flyers.update((f) => f.filter((fl) => fl.id !== id));
  }

  /** Mask a hand card while a swap flyer animates it in. */
  private hide(uuid: number): void {
    this.hiddenUuids.update((s) => new Set(s).add(uuid));
  }

  /** Reveal a previously hidden hand card. */
  private reveal(uuid: number): void {
    this.hiddenUuids.update((s) => {
      const next = new Set(s);
      next.delete(uuid);
      return next;
    });
  }

  /** Show a card that its flyer just landed, at its new place at once rather than transitioning. */
  private snapIntoPlace(uuid: number): void {
    this.reveal(uuid);
    this.snappedUuids.update((s) => new Set(s).add(uuid));
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        this.snappedUuids.update((s) => {
          const next = new Set(s);
          next.delete(uuid);
          return next;
        }),
      ),
    );
  }

  /** Empty the discard pile (a new round). */
  clearPile(): void {
    this.pile.set([]);
  }
}
