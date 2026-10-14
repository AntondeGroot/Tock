import { signal, WritableSignal } from '@angular/core';
import { CardFace, Pos, Zone } from './card-table.types';
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
    const target = this.find(zoneId);
    for (const { cards } of this.owned()) {
      cards.update((held) => held.filter((c) => c.uuid !== card.uuid));
    }
    target.cards.update((held) => [...held, card]);
  }

  /**
   * Where a card sits in a zone: its own slot, when the zone holds it — or else the zone's first
   * slot, for a card that is only coming from there (dealt from a deck that holds nothing).
   */
  slotOf(uuid: number, zoneId: string): Pos {
    const { zone, cards } = this.find(zoneId);
    const held = cards();
    const index = held.findIndex((c) => c.uuid === uuid);
    return index >= 0 ? zone.layout(index, held.length) : zone.layout(0, 1);
  }

  private find(zoneId: string): OwnedZone {
    const found = this.owned().find((o) => o.zone.id === zoneId);
    if (!found) throw new Error(`No zone '${zoneId}' on this table`);
    return found;
  }

  /** Whether the card lies in a face-down zone; a card the table does not hold is face up. */
  isFaceDown(uuid: number): boolean {
    const holder = this.owned().find((o) => o.cards().some((c) => c.uuid === uuid));
    return holder?.zone.faceDown ?? false;
  }

  /** Every zone with its cards, in the order they were defined. */
  contents(): ZoneContents[] {
    return this.owned().map(({ zone, cards }) => ({ zone, cards: cards() }));
  }
}
