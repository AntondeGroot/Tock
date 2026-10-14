import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Card } from './card/card';
import { DEFAULT_CARD_TABLE_OPTIONS } from './card-table';
import { CardBackVM, CardVM, Flyer, ResolvedCardTableOptions } from './card-table.types';

/**
 * The card layer: a dumb, reusable presentational component that renders the hand + pile cards and
 * the transient flyers from a {@link import('./card-table').CardTable} engine. It carries no game
 * logic — the parent supplies the geometry (`cards`, `flyers`), which cards are highlighted
 * (`selectedUuid`, `isSpecial`), and handles clicks/hovers.
 */
@Component({
  selector: 'app-card-layer',
  imports: [Card],
  templateUrl: './card-layer.html',
  styleUrl: './card-layer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardLayer {
  readonly cards = input<CardVM[]>([]);
  readonly flyers = input<Flyer[]>([]);
  /** Other players' face-down fanned hands (positions supplied by the game's board geometry). */
  readonly backs = input<CardBackVM[]>([]);
  /** The currently selected hand card (drawn with a selection ring), or null. */
  readonly selectedUuid = input<number | null>(null);
  /** Which card values get the "special" highlight — the game decides (Keezen: Ace/4/7/J/Q/K). */
  readonly isSpecial = input<(value: number) => boolean>(() => false);
  /** The engine's resolved timings + scales, published as CSS vars so the transitions/keyframes
   *  (in card-layer.scss + card.scss) stay in sync with the engine's setTimeouts. */
  readonly options = input<ResolvedCardTableOptions>(DEFAULT_CARD_TABLE_OPTIONS);

  readonly cardClick = output<number>();
  readonly cardHover = output<number | null>();

  // A face-down card is someone else's: it reports nothing, so no click selects it and no hover
  // gives its value away. The CSS only stops the pointer; this is what keeps the card silent.
  protected click(card: CardVM): void {
    if (!card.faceDown) this.cardClick.emit(card.uuid);
  }

  protected hover(card: CardVM, pointedAt: boolean): void {
    if (!card.faceDown) this.cardHover.emit(pointedAt ? card.value : null);
  }
}
