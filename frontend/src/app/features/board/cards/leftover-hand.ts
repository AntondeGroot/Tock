import { WritableSignal } from '@angular/core';
import { Card as CardModel } from '../../../api';

/**
 * The viewer's hand right after they win. The push empties it at once — the card played, and the
 * leftovers the server throws away — but the leftovers stay in view until the winning pawn has
 * stopped. Then they fly to the pile from where they lie, and the hand the server sent since is
 * shown. Until then, any hand to show is kept for that moment instead.
 */
export class LeftoverHand {
  private held?: { timer: ReturnType<typeof setTimeout>; handAfter: CardModel[] };

  constructor(
    /** The hand the board renders. */
    private readonly hand: WritableSignal<CardModel[]>,
    /** Flies the cards still in the hand to the pile. */
    private readonly discardHand: () => void,
  ) {}

  /** Keep the hand as it is for `ms`, then throw what it holds onto the pile. */
  holdFor(ms: number): void {
    const timer = setTimeout(() => {
      this.discardHand();
      this.hand.set(this.held?.handAfter ?? []);
      this.held = undefined;
    }, ms);
    this.held = { timer, handAfter: [] }; // none, unless a later push says otherwise
  }

  /** Show `cards` — or, while leftovers are in view, show them once those are gone. */
  show(cards: CardModel[]): void {
    if (this.held) this.held.handAfter = cards;
    else this.hand.set(cards);
  }

  /** Forget the leftovers: a reconnect's snapshot shows the hand as it is now. */
  cancel(): void {
    if (this.held) clearTimeout(this.held.timer);
    this.held = undefined;
  }
}
