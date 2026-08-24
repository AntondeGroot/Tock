import { computed, signal } from '@angular/core';
import { Card as CardModel } from '../../api';
import { CardTable } from '../../card-table/card-table';

/**
 * How long the play or forfeit that ENDS a round needs to reach the pile: a forfeit staggers its
 * cards out (up to 4 × 120ms) before the last one's 500ms flight and its 100ms landing buffer.
 */
const CARDS_SETTLE_MS = 1100;

/** The beat where the table sits still, everything settled, before the next round arrives. */
const ROUND_PAUSE_MS = 700;

/** Every count set to zero — what the table really holds the moment a round ends. */
function allEmpty(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(counts).map((id) => [id, 0]));
}

/** A round deal held back until the table has settled, with the newest push's cards to show. */
interface HeldDeal {
  timer: ReturnType<typeof setTimeout>;
  fresh: number[];
  cards: CardModel[];
  counts: Record<string, number>;
}

/**
 * The card table's view of the round: it turns each push's card fields into animations, and owns
 * the hand and per-player counts the board actually RENDERS, which deliberately lag the server.
 *
 * The lag exists because the server deals the next round inside the very request that plays the
 * round's last card. One push therefore carries two events — "the last card was played" and "here
 * are five new ones" — and rendering both at once cuts the first one short: a forfeit stops
 * looking like a forfeit when fresh cards land on top of it. So a round deal is held back until
 * the table has settled and paused; everything else applies at once.
 *
 * Telling a deal from a trade is the hand SIZE: a round grows the hand from empty, a trade is
 * net-neutral (one out, one in).
 */
export class RoundCardsAnimator {
  private prevUuids?: Set<number>;
  private held?: HeldDeal;
  private readonly renderedHand = signal<CardModel[]>([]);
  private readonly renderedCounts = signal<Record<string, number>>({});
  /** True while a round deal is held back, from the round ending until it is released. */
  private readonly holding = signal(false);
  /** True while the batch handed to the card table is a whole round rather than a traded card. */
  private readonly newRound = signal(false);

  constructor(
    private readonly cardTable: CardTable,
    /** The pawns: a long walk must not be cut short by the next deal either. */
    private readonly pawns: { remainingMs(): number } = { remainingMs: () => 0 },
  ) {}

  /** The hand to render. Lags the server across a round change; matches it otherwise. */
  readonly hand = this.renderedHand.asReadonly();

  /** Cards per player to render, for the opponents' fanned backs. Lags the same way. */
  readonly counts = this.renderedCounts.asReadonly();

  /** True from a round ending until its fresh hand has finished landing. */
  readonly dealingNewRound = computed(
    () => this.holding() || (this.newRound() && this.cardTable.dealing()),
  );

  /**
   * Drop the baseline so the next snapshot is shown as-is instead of being animated. Used on
   * (re)connect: that first snapshot is the current hand, not a deal.
   */
  reset(): void {
    if (this.held) clearTimeout(this.held.timer);
    this.held = undefined;
    this.holding.set(false);
    this.prevUuids = undefined;
  }

  /** Take a push's card fields: animate what changed, and render what may be shown yet. */
  accept(cards: CardModel[], counts: Record<string, number>): void {
    const prev = this.prevUuids;
    this.prevUuids = new Set(cards.map((c) => c.uuid));

    // A push landing mid-pause must not release the round early. Keep its (newer) cards so the
    // timer shows those instead of the ones the round ended with.
    if (this.held) {
      this.held = { ...this.held, cards, counts };
      return;
    }

    if (!prev) {
      this.show(cards, counts); // the first snapshot after (re)connecting is not a deal
      return;
    }

    const fresh = cards.filter((c) => !prev.has(c.uuid)).map((c) => c.uuid);
    if (fresh.length === 0) {
      this.show(cards, counts);
      return;
    }

    const isRound = cards.length > prev.size;
    // Hold a round back only when the table still shows the round that just ended — that is the
    // play or forfeit the pause exists for. Dealing onto an already-empty table (the game's first
    // hand, a resync) has nothing to wait for, and pausing there would just look like a stall.
    if (isRound && this.cardsAreInPlay()) {
      this.holdRoundDeal(cards, counts, fresh);
    } else {
      this.deal(cards, counts, fresh, isRound);
    }
  }

  /** Whether the table still holds cards from the round that is ending. */
  private cardsAreInPlay(): boolean {
    return (
      this.renderedHand().length > 0 || Object.values(this.renderedCounts()).some((n) => n > 0)
    );
  }

  /**
   * Keep the table on the round that just ended, then deal once it has settled and paused.
   *
   * Showing every count as zero right now is what lets the round's last card actually fly to the
   * pile: a round is only dealt once EVERY hand is empty, so zero is the truth at this instant —
   * whereas the push already carries the new counts, against which that final card reads as a
   * gain and animates nothing.
   */
  private holdRoundDeal(cards: CardModel[], counts: Record<string, number>, fresh: number[]): void {
    this.renderedCounts.set(allEmpty(counts));
    this.holding.set(true);
    const timer = setTimeout(() => this.releaseHeldDeal(), this.roundDealDelayMs());
    this.held = { timer, fresh, cards, counts };
  }

  private releaseHeldDeal(): void {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    this.holding.set(false);
    this.deal(held.cards, held.counts, held.fresh, true);
  }

  private roundDealDelayMs(): number {
    return Math.max(CARDS_SETTLE_MS, this.pawns.remainingMs()) + ROUND_PAUSE_MS;
  }

  /**
   * Hand the batch to the card table and reveal it. dealIn runs FIRST so the cards' very first
   * frame renders at the deck rather than flashing at their slots.
   */
  private deal(
    cards: CardModel[],
    counts: Record<string, number>,
    fresh: number[],
    isRound: boolean,
  ): void {
    // Card uuids are REUSED across rounds, so a finished round's pile must be cleared or a redealt
    // card whose uuid still lingers in the (never-otherwise-cleared) pile is filtered out of the
    // hand and silently vanishes. Only on a round deal — a trade must not wipe the current pile.
    if (isRound) this.cardTable.clearPile();
    this.newRound.set(isRound);
    this.cardTable.dealIn(fresh);
    this.show(cards, counts);
  }

  private show(cards: CardModel[], counts: Record<string, number>): void {
    this.renderedHand.set(cards);
    this.renderedCounts.set(counts);
  }
}
