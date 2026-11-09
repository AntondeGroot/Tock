import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { RoundCardsAnimator } from './round-cards-animator';
import { CardTable } from 'ng-card-table';
import { Card as CardModel } from '../../../api';

const card = (uuid: number, value = 5): CardModel => ({ uuid, suit: 0, value });

/** A four-card hand for the viewer, as a fresh round deals it. */
const dealtHand = (): CardModel[] => [card(11), card(12), card(13), card(14)];

describe('RoundCardsAnimator', () => {
  let table: CardTable;
  let animator: RoundCardsAnimator;
  /** How long the pawns still need; 0 (nothing moving) unless a test says otherwise. */
  let pawnsRemaining = 0;
  /** Flies the viewer's remaining hand to the pile — the board's BoardCardFly.ownForfeit. */
  let discardHand: Mock<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    pawnsRemaining = 0;
    discardHand = vi.fn<() => void>();
    // Wired as the board does it: the table renders whatever the animator has released.
    table = new CardTable({ hand: () => animator.hand() });
    animator = new RoundCardsAnimator(table, { remainingMs: () => pawnsRemaining }, discardHand);
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

  // A viewer who has finished, or is only watching, is dealt nothing: their own hand stays empty
  // across the round, so it cannot be what tells them a round was dealt. The other hands can — a
  // count only ever goes UP when a round is dealt (a trade swaps a card, it never adds one).
  it('holds a new round back for a viewer who is not dealt in', () => {
    // GIVEN a viewer with no cards, watching the last player hold the round's final card
    animator.accept([], { me: 0, them: 1 });

    // WHEN that card is played and the next round is dealt to the others only
    animator.accept([], { me: 0, them: 4 });

    // THEN the table still reads as the round that just ended, so the last card can fly to the pile
    expect(animator.counts()).toEqual({ me: 0, them: 0 });

    // …and the dealt counts appear only once the cards' flight and the pause have passed
    vi.advanceTimersByTime(1799);
    expect(animator.counts()).toEqual({ me: 0, them: 0 });
    vi.advanceTimersByTime(1);
    expect(animator.counts()).toEqual({ me: 0, them: 4 });
  });

  // A new round starts on an empty pile. For a viewer who is dealt nothing, releasing the round
  // must still clear it — else the others' fresh cards are dealt out over the old round's pile.
  it('clears the pile when a round is released to a viewer who is not dealt in', () => {
    // GIVEN the round's last card lying on the pile, from a viewer with no cards of their own
    animator.accept([], { me: 0, them: 1 });
    table.pile.set([card(7)]);
    animator.accept([], { me: 0, them: 4 });

    // WHEN the held round is released
    vi.advanceTimersByTime(1800);

    // THEN the pile starts the round empty
    expect(table.pile()).toEqual([]);
  });

  // A team trade also brings a card the viewer has not seen, but it is no round: one card leaves,
  // one arrives, and no count goes up. Holding it back would freeze the trade for nearly two
  // seconds, and clearing the pile would wipe the round's played cards.
  it('applies a trade at once, keeping the pile', () => {
    // GIVEN a round in play, with a card on the pile
    animator.accept([card(1), card(2)], { me: 2, them: 3 });
    table.pile.set([card(7)]);

    // WHEN a trade swaps one of the viewer's cards for a King
    animator.accept([card(1), card(20, 13)], { me: 2, them: 3 });

    // THEN the King is in the hand straight away, and the pile is left alone
    expect(animator.hand().map((c) => c.uuid)).toEqual([1, 20]);
    expect(table.pile().map((c) => c.uuid)).toEqual([7]);
  });

  // When the viewer wins, the push takes their whole hand at once: the card they played, and the
  // ones the server throws away because they no longer need them. Shown straight away, those
  // leftovers just vanish mid-walk. They stay in the hand until the winning pawn has stopped, and
  // only then are thrown onto the pile — while the hand still shows them, so they fly from there.
  it("keeps a winner's leftover cards in hand until the pawn has stopped, then discards them", () => {
    // GIVEN the viewer holding three cards
    animator.accept([card(1), card(2), card(3)], { me: 3, them: 2 });
    let handWhenDiscarded: number[] = [];
    discardHand.mockImplementation(() => (handWhenDiscarded = animator.hand().map((c) => c.uuid)));

    // WHEN they win, playing card 1, with a pawn walk of 2000ms: the push empties their hand
    animator.accept([], { me: 0, them: 2 }, 2000);

    // THEN the hand still shows the cards while the pawn walks (card 1 flies off on its own)
    vi.advanceTimersByTime(1999);
    expect(animator.hand().map((c) => c.uuid)).toEqual([1, 2, 3]);
    expect(discardHand).not.toHaveBeenCalled();

    // …and once it has stopped they are thrown onto the pile from the hand, which then empties
    vi.advanceTimersByTime(1);
    expect(discardHand).toHaveBeenCalledTimes(1);
    expect(handWhenDiscarded).toEqual([1, 2, 3]);
    expect(animator.hand()).toEqual([]);
  });

  // A win can also end the round. The winner's leftovers are only thrown away once their pawn has
  // stopped, so the round's cards settle that much later — and the deal must wait for them too,
  // or fresh cards fly out over the leftovers still on their way to the pile.
  it("deals a round that a win ended only once the winner's leftovers have landed", () => {
    // GIVEN the viewer out of cards, and the last player still holding three
    animator.accept([], { me: 0, them: 3 });

    // WHEN that player wins with a pawn walk of 2000ms, which ends the round: the viewer is dealt
    // a new hand, the winner is dealt nothing
    pawnsRemaining = 2000;
    animator.accept(dealtHand(), { me: 4, them: 0 }, 2000);

    // THEN the round waits for the walk, the leftovers' flight to the pile, and the pause on top
    vi.advanceTimersByTime(3799); // 2000ms walk + 1100ms for the cards to settle + 700ms pause
    expect(animator.hand()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(animator.hand().map((c) => c.uuid)).toEqual([11, 12, 13, 14]);
  });
});
