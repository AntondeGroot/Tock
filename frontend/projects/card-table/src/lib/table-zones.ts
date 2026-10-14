import { signal, WritableSignal } from '@angular/core';
import { CardFace, Zone } from './card-table.types';
import { ZoneContents } from './zone-layout';

/** A zone the table holds cards in itself, with what it holds. */
interface OwnedZone {
  zone: Zone;
  cards: WritableSignal<CardFace[]>;
}

/**
 * The zones the table itself keeps cards in — the pile, and whatever a game adds: a meld, a stock.
 * Unlike the hand, which the game reports from its own state, these change only by placing cards
 * in them, so a card is only ever in one of them at a time.
 */
export class TableZones {
  private readonly owned = signal<OwnedZone[]>([]);

  /** Add a zone, after the others: when the hand still lists one of its cards, the zone wins. */
  define(zone: Zone): WritableSignal<CardFace[]> {
    const cards = signal<CardFace[]>([]);
    this.owned.update((zones) => [...zones, { zone, cards }]);
    return cards;
  }

  /** Put a card at the end of a zone, taking it out of whichever zone held it before. */
  place(card: CardFace, zoneId: string): void {
    const target = this.owned().find((o) => o.zone.id === zoneId);
    if (!target) throw new Error(`No zone '${zoneId}' on this table`);
    for (const { cards } of this.owned()) {
      cards.update((held) => held.filter((c) => c.uuid !== card.uuid));
    }
    target.cards.update((held) => [...held, card]);
  }

  /** Every zone with its cards, in the order they were defined. */
  contents(): ZoneContents[] {
    return this.owned().map(({ zone, cards }) => ({ zone, cards: cards() }));
  }
}
