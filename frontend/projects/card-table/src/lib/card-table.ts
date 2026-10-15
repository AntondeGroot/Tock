import { computed, signal } from '@angular/core';
import { CardMasks } from './card-masks';
import {
  CardFace,
  CardTableConfig,
  CardTableTiming,
  CardVM,
  Pos,
  TableLayout,
  Zone,
} from './card-table.types';
import { changeDealt, DealtCard, TableFrame, toCardVM } from './card-view';
import { DEFAULT_LAYOUT } from './default-layout';
import { FlyerLayer } from './flyer-layer';
import { TableZones } from './table-zones';
import { DEFAULT_TIMING } from './timing';
import { DECK_ZONE, HAND_ZONE, PILE_ZONE, placeCards } from './zone-layout';

// The flyer lands (swaps to a pile element) this long AFTER its flight visually ends, so the card
// is fully settled at the pile before the hand-off — avoids a one-frame jump. Not tunable.
const LAND_BUFFER_MS = 100;
// Extra slack after the last dealt card's flight before the deal-in state is cleared.
const DEAL_CLEAR_BUFFER_MS = 2000;

/**
 * The reusable card-table engine: it owns the zones cards sit in (the pile, and any the game
 * defines), the transient flyer layer and the deal-in state, and computes each card's position so
 * the same DOM element animates between zones (a FLIP). Framework-light — Angular signals, no
 * template — so it can be unit-tested like a plain state machine.
 *
 * A game sets it up with a {@link CardTableConfig} — its hand, and optionally a
 * {@link TableLayout} and timings — then drives it from its own state changes: {@link place},
 * {@link dealIn}, {@link flyToPile}, {@link tradeSwap}, {@link clearPile}. A dumb
 * `<ct-card-layer>` renders {@link cards} + {@link flyers}.
 */
export class CardTable {
  /** The timings it runs with: the defaults, with whatever the game retuned. */
  readonly timing: Required<CardTableTiming>;
  // The zones the table holds cards in itself: the pile first, then whatever the game defines.
  private readonly zones = new TableZones();
  // The pile: own cards land with their real uuid, opponents' with a synthetic negative one.
  readonly pile = this.zones.define({
    id: PILE_ZONE,
    layout: (index, count) => this.layout.pile(index, count),
  });
  // Transient face-up cards mid-flight (an opponent's play, a trade swap, a forfeit discard).
  private readonly flyerLayer = new FlyerLayer();
  readonly flyers = this.flyerLayer.flyers;
  // Hand cards masked while a flyer stands in for them: one flying in (the trade swap), so the real
  // card doesn't pop into its slot until the flyer lands on it, or one flying out to the pile.
  private readonly masks = new CardMasks();
  // Deal-in FLIP: each freshly dealt card's turn and start. On its deal's first frame it is drawn
  // at its start, then released to fan out to its slot. Deals overlap — a round deals every seat —
  // so each one only ever touches its own cards.
  private readonly dealt = signal<ReadonlyMap<number, DealtCard>>(new Map());

  private syntheticUuid = -1;

  private readonly hand: CardTableConfig['hand'];
  private readonly layout: TableLayout;

  constructor({ hand, layout = DEFAULT_LAYOUT, timing }: CardTableConfig) {
    this.hand = hand;
    this.layout = layout;
    this.timing = { ...DEFAULT_TIMING, ...timing };
    // Where cards are dealt from by default, laid out by the layout's deck. Keezen's holds nothing
    // — its cards appear from it — but a game may keep its stock there.
    this.zones.define({
      id: DECK_ZONE,
      layout: (index, count) => this.layout.deck(index, count),
    });
  }

  private readonly handZone: Zone = {
    id: HAND_ZONE,
    layout: (index, count) => this.layout.hand(index, count),
  };

  // Every card in its zone, at its slot there. The table's own zones come after the hand, so a card
  // the game still reports in the hand is laid out where the table put it.
  private readonly placed = computed(() =>
    placeCards([{ zone: this.handZone, cards: this.hand() }, ...this.zones.contents()]),
  );

  /** Every card on the table, each with a target position — the layer renders this. */
  readonly cards = computed<CardVM[]>(() => {
    // A pile card's z follows PLAY ORDER (pile index), so the newest is on top regardless of the
    // DOM order — which is sorted by uuid, so moving a card never reorders the list: only its
    // target changes, and the same element transitions cleanly.
    const placed = [...this.placed()];
    const frame: TableFrame = {
      dealt: this.dealt(),
      hidden: this.masks.hidden(),
      snapped: this.masks.snapped(),
      turning: this.masks.turning(),
      timing: this.timing,
    };
    placed.sort((a, b) => a.card.uuid - b.card.uuid);
    return placed.map((p) => toCardVM(p, frame));
  });

  /**
   * Where a card lies, in whichever zone holds it — its place at rest, not mid-deal or mid-flight;
   * undefined for a card not on the table. For a game aiming its own animation at a card.
   */
  positionOf(uuid: number): Pos | undefined {
    return this.placed().find((p) => p.card.uuid === uuid)?.pos;
  }

  /**
   * Where a card added to a zone would land: the place after its last card — or, in an empty zone,
   * the zone's only place, as Keezen's deck, which holds nothing.
   */
  nextPositionIn(zoneId: string): Pos {
    const count = this.placed().filter((p) => p.zoneId === zoneId).length;
    return this.zoneById(zoneId).layout(count, count + 1);
  }

  private zoneById(zoneId: string): Zone {
    return zoneId === HAND_ZONE ? this.handZone : this.zones.zone(zoneId);
  }

  /**
   * Add a zone the table keeps cards in — a meld, a stock. Cards get there by {@link place}; a
   * card the game still reports in the hand is drawn in the zone instead.
   */
  defineZone(zone: Zone): void {
    this.zones.define(zone);
  }

  /**
   * Move a card into a zone, out of whichever zone held it; it transitions to its new slot, turning
   * over on the way when it goes between a face-down zone and a face-up one. The card carries its
   * face, so one leaving a face-down zone can bring the face no one knew until now.
   */
  place(card: CardFace, zoneId: string): void {
    const wasFaceDown = this.zones.isFaceDown(card.uuid);
    this.zones.place(card, zoneId);
    const isFaceDown = this.zones.isFaceDown(card.uuid);
    if (wasFaceDown !== isFaceDown) {
      this.masks.turn(card.uuid, isFaceDown ? 'out' : 'in', this.timing.flyMs);
    }
  }

  /** True while a deal-in is animating — a game can sync its own dealt visuals (e.g. opponents). */
  readonly dealing = computed(() => this.dealt().size > 0);
  /** True on the first frame of a deal, while dealt cards are still stacked at the deck. */
  readonly stacked = computed(() => [...this.dealt().values()].some((d) => d.atStart));

  /** Kick off the deal-in FLIP for the given freshly-dealt hand card uuids, from the deck. */
  dealIn(uuids: number[]): void {
    this.startDeal(uuids, DECK_ZONE);
  }

  /**
   * Deal cards one after another into a zone. Each leaves from where it lies in `from` — its own
   * slot when the table holds it there (a Rummikub pool), else that zone's place (Keezen's deck,
   * which cards appear from) — and fans out to its slot in `into`. Cards dealt into the hand are
   * left to the game, which reports them there itself. `delayMs` shifts the whole deal back: a
   * round dealt round-robin is one deal per seat, each a beat behind the one before.
   */
  deal(cards: CardFace[], { from = DECK_ZONE, into = HAND_ZONE, delayMs = 0 } = {}): void {
    // Start first: placing the cards takes them out of `from`, and their slots there with them.
    this.startDeal(
      cards.map((c) => c.uuid),
      from,
      delayMs,
    );
    if (into !== HAND_ZONE) cards.forEach((c) => this.zones.place(c, into));
  }

  private startDeal(uuids: number[], from: string, delayMs = 0): void {
    // First frame: drawn where they are dealt from, alongside any deal still under way.
    this.dealt.update((all) => {
      const next = new Map(all);
      uuids.forEach((uuid, order) =>
        next.set(uuid, { order, delayMs, start: this.zones.positionOf(uuid, from), atStart: true }),
      );
      return next;
    });
    // Release next frame so they transition out to their slots (staggered by delay).
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        this.dealt.update((all) => changeDealt(all, uuids, (d) => ({ ...d, atStart: false }))),
      ),
    );
    // Clear once the last card has finished (its delay + the transition).
    setTimeout(
      () => this.dealt.update((all) => changeDealt(all, uuids, () => undefined)),
      delayMs + uuids.length * this.timing.dealStaggerMs + DEAL_CLEAR_BUFFER_MS,
    );
  }

  /**
   * Fly `card` from its current slot to the pile centre, then drop the flyer and leave it on the
   * pile. The card is passed by identity (its uuid) and carries its own face + start position — a
   * captured hand card (own play/forfeit) or a faceless external card (an opponent's play/forfeit),
   * which has no uuid and is landed with a fresh synthetic id. Own plays pop; opponents flip in.
   *
   * The flyer is a copy, and the hand may go on showing the original — until the push drops it,
   * or for the whole pause when the move ended the round. So a hand card is hidden while its flyer
   * is up, keeping its slot so the rest of the fan stays put, and snaps onto the pile on landing:
   * that same element sliding over from the hand would fly the card a second time.
   */
  flyToPile(
    card: { uuid?: number; suit: number; value: number; x: number; y: number; rot?: number },
    opts: { startScale?: number; flip?: 'in' | 'out'; pop?: boolean } = {},
  ): void {
    const fromHand = card.uuid !== undefined;
    if (fromHand) this.masks.hide(card.uuid!);
    const landCard: CardFace = {
      uuid: card.uuid ?? this.syntheticUuid--,
      suit: card.suit,
      value: card.value,
    };
    const id = this.flyerLayer.launch({
      x: card.x,
      y: card.y,
      rot: card.rot ?? 0,
      scale: opts.startScale ?? 1,
      suit: card.suit,
      value: card.value,
      flip: opts.flip,
      glow: opts.pop,
    });

    const { flyMs, popMs, popScale } = this.timing;
    const flightMs = flyMs + LAND_BUFFER_MS; // land a beat after the flight visually completes
    // It flies to the middle of the table, where the deck stands, at the size it will lie on the
    // pile — then settles into its own pile slot as it lands.
    const center = this.layout.deck(0, 1);
    const onPile = this.pile().length;
    const pileScale = this.layout.pile(onPile, onPile + 1).scale ?? 1;
    const flyToPile = () =>
      this.flyerLayer.update(id, {
        x: center.x,
        y: center.y,
        rot: 0,
        scale: pileScale,
        glow: false,
      });
    const land = () => {
      this.flyerLayer.remove(id);
      this.pile.update((p) => [...p, landCard]);
      if (fromHand) this.masks.snapIntoPlace(landCard.uuid);
    };

    if (opts.pop) {
      // Swell the card + glow (a "played!" beat), hold popMs, then fly to the pile.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.flyerLayer.update(id, { scale: popScale })),
      );
      setTimeout(flyToPile, popMs);
      setTimeout(land, popMs + flightMs);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(flyToPile));
      setTimeout(land, flightMs);
    }
  }

  /**
   * Animate a two-way card trade between the viewer's hand and a partner's fan. The card you
   * `gave` leaves your hand, turns face-down and shrinks into the partner fan; the card you
   * `got` flies out of that fan as a back, turns over and grows into your hand `slot`. The
   * received card is masked until its flyer lands so it never shows in two places at once. The
   * game supplies only the three board positions (its geometry) — the partner's with the size of a
   * card in their fan; the timing, flips and masking live here.
   */
  tradeSwap(
    partner: Pos,
    gave: { suit: number; value: number; from: Pos },
    got: { uuid: number; suit: number; value: number; to: Pos },
  ): void {
    const { tradeRevealMs, flyMs } = this.timing;
    const landMs = flyMs + LAND_BUFFER_MS;
    const fanScale = partner.scale ?? 1; // a card's size in the partner's fan
    // Your card shrinks face-down into the partner's fan.
    const out = { fromScale: 1, toScale: fanScale, flip: 'out' } as const;
    this.flyerLayer.flyBetween(gave.from, partner, gave, out, landMs);
    // The received card grows face-up out of the partner's fan into your hand; keep the real card
    // hidden while it flies, revealing it a frame before the flyer lands (they overlap, no gap).
    this.masks.hide(got.uuid);
    setTimeout(() => this.masks.reveal(got.uuid), tradeRevealMs);
    const into = { fromScale: fanScale, toScale: 1, flip: 'in' } as const;
    this.flyerLayer.flyBetween(partner, got.to, got, into, landMs);
  }

  /** Empty the discard pile (a new round). */
  clearPile(): void {
    this.pile.set([]);
  }
}
