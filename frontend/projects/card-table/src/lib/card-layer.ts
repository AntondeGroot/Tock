import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { Card } from './card/card';
import { CardTable } from './card-table';
import { CardVM, FaceContext } from './card-table.types';
import { DECK_ZONE } from './zone-layout';

/**
 * The card layer: a dumb, reusable presentational component that renders a {@link CardTable}'s
 * cards and transient flyers. It carries no game logic — the parent supplies the table, which
 * cards are highlighted (`selectedUuid`, `isSpecial`), and handles clicks/hovers.
 */
@Component({
  selector: 'ct-card-layer',
  imports: [Card],
  templateUrl: './card-layer.html',
  styleUrl: './card-layer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardLayer {
  /** The table to draw: its cards, its flyers, and the timings its CSS transitions follow. */
  readonly table = input.required<CardTable>();
  /** The game's own card front, given each card; without one, fronts come from the sprite sheet. */
  readonly face = input<TemplateRef<FaceContext> | null>(null);
  /** The currently selected hand card (drawn with a selection ring), or null. */
  readonly selectedUuid = input<number | null>(null);
  /** Which card values get the "special" highlight — the game decides (Keezen: Ace/4/7/J/Q/K). */
  readonly isSpecial = input<(value: number) => boolean>(() => false);

  readonly cardClick = output<number>();
  readonly cardHover = output<number | null>();

  /** The size of a card stacked onto the deck, which the backs' borders are drawn against. */
  protected readonly deckScale = computed(() => this.table().nextPositionIn(DECK_ZONE).scale ?? 1);

  // A face-down card is someone else's: it reports nothing, so no click selects it and no hover
  // gives its value away. The CSS only stops the pointer; this is what keeps the card silent.
  protected click(card: CardVM): void {
    if (!card.faceDown) this.cardClick.emit(card.uuid);
  }

  protected hover(card: CardVM, pointedAt: boolean): void {
    if (!card.faceDown) this.cardHover.emit(pointedAt ? card.value : null);
  }
}
