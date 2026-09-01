import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Card } from '../../../../card-table/card/card';
import { Card as CardModel, Trade, TradeAction, TradeService } from '../../../../api';
import { Translations } from '../../../../i18n/translations.service';
import { postTradeAction } from '../trade-actions';

type Mode = 'pick' | 'respond' | 'closed';

/**
 * How long the requester gets once their teammate has committed. At that point the swap waits on
 * them alone, and a teammate who has given up a King should not be left hanging — so the clock
 * runs out and a card is picked for them.
 */
const AUTO_PICK_SECONDS = 10;
/**
 * A tick runs a little longer than a real second: counting down at exactly one a second, the
 * numbers rattle past faster than anyone can read a hand of cards and choose one.
 */
const TICK_MS = 1200;

/**
 * The team card-trade "parley" (step 5, part 3). The ask itself is sent by the board the moment
 * the button is pressed — pressing a button labelled "ask" should ask — so by the time this panel
 * opens the teammate has already been told. It then has two faces, driven by the shared state:
 *  - pick    — you asked: choose the card you give back. Tapping a card sends it, and tapping
 *              another replaces it, so there is no separate confirm step;
 *  - respond — your teammate asked you: hand over a King/Ace, or decline. You need not wait for
 *              them to have picked — your half is held and the swap settles when theirs lands.
 * All actions go straight to the trade endpoint; the swap and the closing come back over SSE.
 */
@Component({
  selector: 'app-trade-panel',
  imports: [Card],
  templateUrl: './trade-panel.html',
  styleUrl: './trade-panel.scss',
})
export class TradePanel {
  private readonly tradeService = inject(TradeService);
  protected readonly i18n = inject(Translations);

  readonly hand = input<CardModel[]>([]);
  readonly trade = input<Trade | null>(null);
  readonly viewerId = input<string>('');
  readonly sessionId = input<string>('');
  /** The other party's display name — the teammate (pick) or the requester (respond). */
  readonly otherName = input<string>('');

  private readonly selectedUuid = signal<number | null>(null);
  /** Ticks left before a card is picked for you, or null when nothing is waiting on you. */
  protected readonly secondsLeft = signal<number | null>(null);
  /** How long the ring takes to close — the whole countdown, in ms. */
  protected readonly countdownMs = AUTO_PICK_SECONDS * TICK_MS;

  constructor() {
    effect((onCleanup) => {
      // Their half is in and yours is not: you are the only thing the swap is waiting on.
      const waitingOnMe = this.mode() === 'pick' && !!this.answeredCard() && !this.offeredCard();
      if (!waitingOnMe) {
        this.secondsLeft.set(null);
        return;
      }
      let left = AUTO_PICK_SECONDS;
      this.secondsLeft.set(left);
      const tick = setInterval(() => {
        left -= 1;
        this.secondsLeft.set(left);
        if (left <= 0) {
          clearInterval(tick);
          this.giveRandomCard();
        }
      }, TICK_MS);
      onCleanup(() => clearInterval(tick));
    });
  }

  /** Out of time: give one of your cards rather than leave your teammate's King in limbo. */
  private giveRandomCard(): void {
    const hand = this.hand();
    if (hand.length === 0) return;
    // The platform RNG rather than Math.random: no lint argument to have, and the tiny modulo
    // bias over a five-card hand is beneath noticing.
    const pick = crypto.getRandomValues(new Uint32Array(1))[0] % hand.length;
    this.give(hand[pick]);
  }

  protected readonly mode = computed<Mode>(() => {
    const t = this.trade();
    const me = this.viewerId();
    if (t && t.teammateId === me) return 'respond';
    if (t && t.requesterId === me) return 'pick';
    return 'closed';
  });

  /** What the requester is giving, once they have picked — absent until then. */
  protected readonly offeredCard = computed(() => this.trade()?.offeredCard ?? null);
  /** The King/Ace the teammate has committed — absent until they hand one over. */
  protected readonly answeredCard = computed(() => this.trade()?.answeredCard ?? null);

  protected isOffered(c: CardModel): boolean {
    return this.offeredCard()?.uuid === c.uuid;
  }

  protected isKingOrAce(c: CardModel): boolean {
    return c.value === 1 || c.value === 13;
  }
  /** Only a King/Ace answers the ask. */
  protected selectable(c: CardModel): boolean {
    return this.isKingOrAce(c);
  }
  protected isSelected(c: CardModel): boolean {
    return this.answeredCard()?.uuid === c.uuid || this.selectedUuid() === c.uuid;
  }
  protected pick(c: CardModel): void {
    if (this.selectable(c)) this.selectedUuid.set(c.uuid ?? null);
  }

  /** Name (or rename) the card you give — it goes straight over the wire, no confirm step. */
  protected give(c: CardModel): void {
    this.send(TradeAction.ActionEnum.Offer, c);
  }

  /** Give as soon as you have chosen a King/Ace — the other half can land afterwards. */
  protected readonly canConfirm = computed(() => {
    const c = this.hand().find((x) => x.uuid === this.selectedUuid());
    return !!c && this.selectable(c);
  });

  protected confirm(): void {
    const c = this.hand().find((x) => x.uuid === this.selectedUuid());
    if (!c) return;
    this.send(TradeAction.ActionEnum.Accept, c);
    this.selectedUuid.set(null);
  }
  protected decline(): void {
    this.send(TradeAction.ActionEnum.Reject);
    this.selectedUuid.set(null);
  }
  protected cancel(): void {
    this.send(TradeAction.ActionEnum.Cancel);
    this.selectedUuid.set(null);
  }

  private send(action: TradeAction.ActionEnum, card?: CardModel): void {
    postTradeAction(this.tradeService, this.sessionId(), this.viewerId(), action, card);
  }
}
