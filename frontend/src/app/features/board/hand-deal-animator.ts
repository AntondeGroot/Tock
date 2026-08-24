import { computed, signal } from '@angular/core';
import { Card as CardModel } from '../../api';
import { CardTable } from '../../card-table/card-table';

/**
 * Turns successive hand snapshots into deal-in animations, and knows what kind of deal is
 * currently in flight.
 *
 * The server sends whole hands, never events, so "a card arrived" has to be diffed out of two
 * snapshots — and two very different things look identical in that diff: a fresh round, and the
 * single card a team trade hands you. The hand SIZE tells them apart (a round grows the hand from
 * empty; a trade is net-neutral, one out and one in), which is what {@link dealingNewRound}
 * reports for callers that must treat the two differently.
 */
export class HandDealAnimator {
  private prevUuids?: Set<number>;
  private readonly newRound = signal(false);

  constructor(private readonly cardTable: CardTable) {}

  /** True while a whole new round is still landing; a trade's single card does not count. */
  readonly dealingNewRound = computed(() => this.newRound() && this.cardTable.dealing());

  /**
   * Drop the baseline so the next snapshot is shown as-is instead of being animated. Used on
   * (re)connect: that first snapshot is the current hand, not a deal.
   */
  reset(): void {
    this.prevUuids = undefined;
  }

  /** Diff `cards` against the previous snapshot and deal in whatever is new. */
  accept(cards: CardModel[]): void {
    const prev = this.prevUuids;
    this.prevUuids = new Set(cards.map((c) => c.uuid));
    if (!prev) return;

    const handGrew = cards.length > prev.size;
    // Card uuids are REUSED across rounds, so a finished round's pile must be cleared or a redealt
    // card whose uuid still lingers in the (never-otherwise-cleared) pile is filtered out of the
    // hand and silently vanishes. Only on a round deal — a trade must not wipe the current pile.
    if (handGrew) this.cardTable.clearPile();

    const fresh = cards.filter((c) => !prev.has(c.uuid)).map((c) => c.uuid);
    if (fresh.length === 0) return;
    this.newRound.set(handGrew); // describes the batch about to animate
    this.cardTable.dealIn(fresh);
  }
}
