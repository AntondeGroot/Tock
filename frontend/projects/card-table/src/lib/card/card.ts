import { Component, Input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FaceContext } from '../card-table.types';

/**
 * A single playing card, drawn from a sprite sheet (the bundled ./card-deck.png by default; a
 * host game can swap it via the --card-sheet / --card-cols / --card-rows CSS vars — see card.scss).
 * suit (row) and value (column) are exposed to CSS as --card-row / --card-col, which pick the cell.
 * One element per card (the parent tracks by uuid), so the same element can transition hand → pile.
 * A game that draws its own fronts — tiles, say — passes `face`, a template given the card.
 */
@Component({
  selector: 'app-card',
  imports: [NgTemplateOutlet],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  host: {
    '[style.--card-col]': 'value - 1',
    '[style.--card-row]': 'suit',
  },
})
export class Card {
  @Input() suit = 0;
  @Input() value = 1;
  /** The game's own front; the sprite cell when there is none. */
  @Input() face: TemplateRef<FaceContext> | null = null;

  protected get faceContext(): FaceContext {
    return { $implicit: { suit: this.suit, value: this.value } };
  }
}
