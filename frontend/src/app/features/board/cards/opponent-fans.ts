import { CardFace, CardTable, PILE_ZONE, Pos } from 'ng-card-table';
import {
  BoardGeometry,
  FAN_SCALE,
  fanCardBacks,
  opponentsClockwise,
} from '../geometry/board-geometry';
import { parseCard } from './played-card';

/** The card table's zone holding a player's hand, face down. */
const fanZone = (playerId: string) => `fan:${playerId}`;

/** What a stand-in shows until it is played: nothing, as it lies face down. */
const NO_FACE = { suit: 0, value: 0 };

/** A round is dealt round-robin: each seat's cards leave this long after the seat before's. */
const SEAT_DEAL_MS = 350;

/** A forfeited hand leaves one card at a time, so it reads as a run of discards, not a blur. */
const DISCARD_STAGGER_MS = 120;

/**
 * The other players' hands, as face-down fans the card table holds. Only their sizes are known —
 * the server sends a count per player, never their cards — so each fan holds stand-ins with no
 * face, which the table draws as backs. Fed the shown counts on every push.
 */
export class OpponentFans {
  /** Each opponent's stand-ins, by uuid, in fan order. */
  private readonly fans = new Map<string, number[]>();
  // Stand-ins need uuids no real card has; real ones are positive, the table's own run from -1.
  private nextUuid = -1_000_000;
  /** Whether a push has been seen: the first one is the table as it stands, not a deal. */
  private seen = false;

  constructor(
    private readonly geometry: () => BoardGeometry | undefined,
    private readonly table: CardTable,
    private readonly viewerId: string | null,
  ) {}

  reactToCounts(counts: Record<string, number>, played: string[]): void {
    const g = this.geometry();
    if (!g) return;
    const firstPush = !this.seen;
    this.seen = true;
    // Clockwise from the viewer, so a deal sweeps round the table: seat 1 first, then seat 2…
    opponentsClockwise(g, Object.keys(counts), this.viewerId).forEach((playerId, i) => {
      const fan = this.fanOf(playerId);
      const dropped = fan.length - counts[playerId];
      if (dropped === 1) this.playOutermost(fan, played.at(-1));
      else if (dropped > 1) this.discard(fan, played.slice(-dropped));
      else if (dropped < 0) this.fill(playerId, counts[playerId], firstPush ? null : i + 1);
    });
  }

  /**
   * Bring a fan up to `count` cards: placed straight in on the first push (the table as it stands),
   * or dealt in from the deck as seat `seat` of the round-robin.
   */
  private fill(playerId: string, count: number, seat: number | null): void {
    const fresh = this.standInsFor(playerId, count);
    const zone = fanZone(playerId);
    if (seat === null) fresh.forEach((card) => this.table.place(card, zone));
    else this.table.deal(fresh, { into: zone, delayMs: seat * SEAT_DEAL_MS });
  }

  /**
   * A play: the fan's outermost card goes to the pile, turning over to the face that was played.
   * With no face listed — a reshuffle cleared the pile as the card was played — it stays in the
   * fan: forgetting a card the table still draws would leave the fan one too many after the deal.
   */
  private playOutermost(fan: number[], played: string | undefined): void {
    if (played === undefined) return;
    const uuid = fan.pop()!;
    this.table.place({ uuid, ...parseCard(played) }, PILE_ZONE);
  }

  /**
   * A forfeit: the fan's cards go to the pile one after another, turning over to the faces the
   * server discarded them as — paired in order, so the pile reads like the played list.
   */
  private discard(fan: number[], faces: string[]): void {
    const leaving = fan.splice(0, faces.length);
    leaving.forEach((uuid, i) =>
      setTimeout(
        () => this.table.place({ uuid, ...parseCard(faces[i]) }, PILE_ZONE),
        i * DISCARD_STAGGER_MS,
      ),
    );
  }

  /** New stand-ins to bring a player's fan up to `count` cards — none when it already holds them. */
  private standInsFor(playerId: string, count: number): CardFace[] {
    const fan = this.fanOf(playerId);
    const fresh: CardFace[] = [];
    while (fan.length < count) {
      const card = { uuid: this.nextUuid--, ...NO_FACE };
      fan.push(card.uuid);
      fresh.push(card);
    }
    return fresh;
  }

  /** A player's stand-ins — defining their fan on the table the first time it is asked for. */
  private fanOf(playerId: string): number[] {
    let fan = this.fans.get(playerId);
    if (!fan) {
      fan = [];
      this.fans.set(playerId, fan);
      this.table.defineZone({
        id: fanZone(playerId),
        faceDown: true,
        layout: (index, count) => this.slot(playerId, index, count),
      });
    }
    return fan;
  }

  /** The `index`-th of `count` backs in a player's fan, in the card layer's %-space. */
  private slot(playerId: string, index: number, count: number): Pos {
    const segment = this.geometry()?.deckSegment(playerId);
    const back = segment ? fanCardBacks(segment, count)[index] : undefined;
    if (!back) return { x: 0, y: 0 };
    return { x: back.x / 6, y: back.y / 6, rot: back.rotDeg, scale: FAN_SCALE };
  }
}
