import { computed, signal } from '@angular/core';
import { Card as CardModel } from '../../../api';
import { CardTable } from 'ng-card-table';
import { allEmpty, HandCounts, hasLeftovers, isRoundDeal } from './round-counts';
import { LeftoverHand } from './leftover-hand';
import { roundDealDelayMs } from './round-timing';

/** One push's card fields; moveSettlesInMs is set when it came with a move. */
interface Push {
  cards: CardModel[];
  counts: HandCounts;
  moveSettlesInMs?: number;
}

/** A round deal held back until the table has settled, with the newest push's cards to show. */
interface HeldDeal {
  timer: ReturnType<typeof setTimeout>;
  fresh: number[];
  cards: CardModel[];
  counts: HandCounts;
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
 * Telling a deal from a trade is the hand SIZES: a round grows them, a trade is net-neutral (one
 * out, one in).
 *
 * A win empties the winner's hand in one push too: the card played, and the leftovers the server
 * throws away. The leftovers wait for the winning pawn to stop — the viewer's own stay in the hand
 * until then — and a round that the win ended is dealt only once they have landed as well.
 */
export class RoundCardsAnimator {
  private prevUuids?: Set<number>;
  private prevCounts: HandCounts = {};
  private held?: HeldDeal;
  private readonly renderedHand = signal<CardModel[]>([]);
  /** Holds the viewer's own leftovers from a win in the hand, until their pawn stops. */
  private readonly leftovers = new LeftoverHand(this.renderedHand, () => this.discardHand());
  private readonly renderedCounts = signal<HandCounts>({});
  /** True while a round deal is held back, from the round ending until it is released. */
  private readonly holding = signal(false);
  /** True while the batch handed to the card table is a whole round rather than a traded card. */
  private readonly newRound = signal(false);

  constructor(
    private readonly cardTable: CardTable,
    /** The pawns: a long walk must not be cut short by the next deal either. */
    private readonly pawns: { remainingMs(): number } = { remainingMs: () => 0 },
    /** Flies the cards still in the viewer's hand to the pile: their leftovers, after a win. */
    private readonly discardHand: () => void = () => undefined,
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
    this.leftovers.cancel();
    this.held = undefined;
    this.holding.set(false);
    this.prevUuids = undefined;
  }

  /**
   * Take a push's card fields: animate what changed, and render what may be shown yet.
   *
   * @param moveSettlesInMs set when the push came with a move: in how many ms its pawns stop.
   */
  accept(cards: CardModel[], counts: HandCounts, moveSettlesInMs?: number): void {
    const prev = this.prevUuids;
    const prevCounts = this.prevCounts;
    this.prevUuids = new Set(cards.map((c) => c.uuid));
    this.prevCounts = counts;

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

    this.animateChange({ cards, counts, moveSettlesInMs }, prev, prevCounts);
  }

  /** Animate how a push differs from the one before it: a win, a round, a trade, or a play. */
  private animateChange(push: Push, prev: Set<number>, prevCounts: HandCounts): void {
    const { cards, counts, moveSettlesInMs } = push;
    // More than one card gone with a move: the viewer won, and threw away what they had left.
    if (moveSettlesInMs !== undefined && prev.size - cards.length > 1) {
      this.leftovers.holdFor(moveSettlesInMs);
    }

    const fresh = cards.filter((c) => !prev.has(c.uuid)).map((c) => c.uuid);
    if (isRoundDeal(prevCounts, counts)) {
      const winnerSettlesInMs = hasLeftovers(prevCounts, counts) ? moveSettlesInMs : undefined;
      this.startRound(cards, counts, fresh, winnerSettlesInMs);
    } else if (fresh.length > 0) {
      this.deal(cards, counts, fresh, false); // a traded card
    } else {
      this.show(cards, counts);
    }
  }

  /**
   * Hold a round back only when the table still shows the round that just ended — that is the
   * play or forfeit the pause exists for. Dealing onto an already-empty table (the game's first
   * hand, a resync) has nothing to wait for, and pausing there would just look like a stall.
   */
  private startRound(
    cards: CardModel[],
    counts: HandCounts,
    fresh: number[],
    winnerSettlesInMs?: number,
  ): void {
    if (this.cardsAreInPlay()) this.holdRoundDeal(cards, counts, fresh, winnerSettlesInMs);
    else this.deal(cards, counts, fresh, true);
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
  private holdRoundDeal(
    cards: CardModel[],
    counts: HandCounts,
    fresh: number[],
    winnerSettlesInMs?: number,
  ): void {
    this.renderedCounts.set(allEmpty(counts));
    this.holding.set(true);
    const delayMs = roundDealDelayMs(this.pawns.remainingMs(), winnerSettlesInMs);
    const timer = setTimeout(() => this.releaseHeldDeal(), delayMs);
    this.held = { timer, fresh, cards, counts };
  }

  private releaseHeldDeal(): void {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    this.holding.set(false);
    this.deal(held.cards, held.counts, held.fresh, true);
  }

  /**
   * Hand the batch to the card table and reveal it. dealIn runs FIRST so the cards' very first
   * frame renders at the deck rather than flashing at their slots.
   */
  private deal(cards: CardModel[], counts: HandCounts, fresh: number[], isRound: boolean): void {
    // Card uuids are REUSED across rounds, so a finished round's pile must be cleared or a redealt
    // card whose uuid still lingers in the (never-otherwise-cleared) pile is filtered out of the
    // hand and silently vanishes. Only on a round deal — a trade must not wipe the current pile.
    if (isRound) this.cardTable.clearPile();
    this.newRound.set(isRound);
    this.cardTable.dealIn(fresh);
    this.show(cards, counts);
  }

  private show(cards: CardModel[], counts: HandCounts): void {
    this.leftovers.show(cards);
    this.renderedCounts.set(counts);
  }
}
