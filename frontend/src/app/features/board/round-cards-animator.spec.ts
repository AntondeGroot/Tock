import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoundCardsAnimator } from './round-cards-animator';
import { CardTable } from '../../card-table/card-table';
import { DefaultCardPositioner } from '../../card-table/default-positioner';
import { Card as CardModel } from '../../api';

const card = (uuid: number, value = 5): CardModel => ({ uuid, suit: 0, value });

/** A four-card hand for the viewer, as a fresh round deals it. */
const dealtHand = (): CardModel[] => [card(11), card(12), card(13), card(14)];

describe('RoundCardsAnimator', () => {
  let table: CardTable;
  let animator: RoundCardsAnimator;
  /** How long the pawns still need; 0 (nothing moving) unless a test says otherwise. */
  let pawnsRemaining = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    pawnsRemaining = 0;
    // Wired as the board does it: the table renders whatever the animator has released.
    table = new CardTable(() => animator.hand(), new DefaultCardPositioner());
    animator = new RoundCardsAnimator(table, { remainingMs: () => pawnsRemaining });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // The server deals the next round inside the same request that plays the round's last card, so
  // one push says both "that card was played" and "here are four new ones". Releasing the deal now
  // lands fresh cards on top of a forfeit that is still flying to the pile — the bug this fixes.
  it('holds a new round back until the table has settled', () => {
    // GIVEN a table mid-round: the viewer holds their last card
    animator.accept([card(1)], { me: 1, them: 0 });
    expect(animator.hand()).toHaveLength(1);

    // WHEN the push arrives that both empties that hand and deals the next round
    animator.accept(dealtHand(), { me: 4, them: 4 });

    // THEN the table still reads as the round that just ended: the old hand, whose played card is
    // already on the pile and so filtered out of the fan. None of the new cards are shown.
    expect(animator.hand().map((c) => c.uuid)).toEqual([1]);
    vi.advanceTimersByTime(1799); // the cards' flight (1100ms) plus the pause (700ms), less a tick
    expect(animator.hand().map((c) => c.uuid)).toEqual([1]);

    // …and only once that has passed does the round land
    vi.advanceTimersByTime(1);
    expect(animator.hand().map((c) => c.uuid)).toEqual([11, 12, 13, 14]);
  });

  // For everyone ELSE at the table the last card is animated off the drop in that player's count.
  // The push already carries their newly dealt count, against which the final card reads as a GAIN
  // and animates nothing — so while the round is held, every hand is reported as empty. That is
  // simply the truth at this instant: a round is only dealt once every hand has run out.
  it('empties every hand while the round is held, so the last card can fly to the pile', () => {
    // GIVEN the last player still holding the round's final card
    animator.accept([card(1)], { me: 1, them: 0 });
    expect(animator.counts()).toEqual({ me: 1, them: 0 });

    // WHEN that card is played and the next round rides in on the same push
    animator.accept(dealtHand(), { me: 4, them: 4 });

    // THEN the table reports everyone as out — a drop from 1 to 0, which is a card being played
    expect(animator.counts()).toEqual({ me: 0, them: 0 });

    // …and the dealt counts appear only when the round is released
    vi.advanceTimersByTime(1800);
    expect(animator.counts()).toEqual({ me: 4, them: 4 });
  });

  // The pause exists to let a play or forfeit finish. With an already-empty table there is nothing
  // to finish, and holding the cards back would read as the game stalling before it starts.
  it('deals immediately onto an empty table, with nothing to wait for', () => {
    // GIVEN a settled table that holds no cards at all
    animator.accept([], { me: 0, them: 0 });

    // WHEN a round is dealt onto it
    animator.accept(dealtHand(), { me: 4, them: 4 });

    // THEN it lands at once, no pause
    expect(animator.hand().map((c) => c.uuid)).toEqual([11, 12, 13, 14]);
    expect(animator.counts()).toEqual({ me: 4, them: 4 });
  });

  // The last card of a round is usually also a MOVE, and a pawn can be walking a long way. Dealing
  // on the cards' own timing alone would cut that walk short, so the wait takes whichever is
  // longer — otherwise the fix for the cards just moves the problem onto the pawns.
  it('waits for a long pawn walk before dealing', () => {
    // GIVEN a pawn still walking well past the time the cards need to settle
    pawnsRemaining = 3000;
    animator.accept([card(1)], { me: 1, them: 0 });

    // WHEN the round-ending push arrives
    animator.accept(dealtHand(), { me: 4, them: 4 });

    // THEN the cards' own 1100ms + 700ms is not enough — the walk is still running
    vi.advanceTimersByTime(1800);
    expect(animator.hand().map((c) => c.uuid)).toEqual([1]);

    // …and the round lands only once the walk has finished and the pause has passed on top of it
    vi.advanceTimersByTime(1900); // 3000ms walk + 700ms pause
    expect(animator.hand().map((c) => c.uuid)).toEqual([11, 12, 13, 14]);
  });

  // Pushes keep arriving during the pause — someone leaves, a pawn settles. Such a push must not
  // cut the pause short (it carries the already-dealt hand, which would sail straight through as
  // "nothing new"), and what finally lands has to be its cards, not the ones now a second stale.
  it('shows the newest cards when a push lands mid-pause', () => {
    // GIVEN a round held back after its last card was played
    animator.accept([card(1)], { me: 1, them: 0 });
    animator.accept(dealtHand(), { me: 4, them: 4 });

    // WHEN another push lands mid-pause — a player has left, so they are gone from the counts
    vi.advanceTimersByTime(500);
    animator.accept(dealtHand(), { me: 4 });

    // THEN the pause runs its course rather than being released by that push
    expect(animator.hand().map((c) => c.uuid)).toEqual([1]);

    // …and when it ends, the counts are the newest ones, not the round-end ones
    vi.advanceTimersByTime(1300); // 1800ms after the round ended
    expect(animator.hand().map((c) => c.uuid)).toEqual([11, 12, 13, 14]);
    expect(animator.counts()).toEqual({ me: 4 });
  });
});
