import { signal } from '@angular/core';

/** A copy of `set` with `uuid` added or taken out — signals need a new Set to notice a change. */
function withUuid(set: ReadonlySet<number>, uuid: number, present: boolean): Set<number> {
  const next = new Set(set);
  if (present) next.add(uuid);
  else next.delete(uuid);
  return next;
}

/**
 * How the table draws a card while a flyer stands in for it. The flyer is a copy, so the original
 * is hidden for the flight — keeping its slot, so the cards around it stay put — and, where the
 * flight lands it somewhere new, snaps there for one frame instead of sliding over a second time.
 */
export class CardMasks {
  private readonly hiddenUuids = signal<ReadonlySet<number>>(new Set());
  private readonly snappedUuids = signal<ReadonlySet<number>>(new Set());
  private readonly turningUuids = signal<ReadonlyMap<number, 'in' | 'out'>>(new Map());
  /** Cards drawn invisible, while their flyer is in the air. */
  readonly hidden = this.hiddenUuids.asReadonly();
  /** Cards placed this frame without a transition, because their flyer just landed them. */
  readonly snapped = this.snappedUuids.asReadonly();
  /** Cards turning over as they move: `in` coming face up, `out` going face down. */
  readonly turning = this.turningUuids.asReadonly();

  hide(uuid: number): void {
    this.hiddenUuids.update((s) => withUuid(s, uuid, true));
  }

  reveal(uuid: number): void {
    this.hiddenUuids.update((s) => withUuid(s, uuid, false));
  }

  /** Turn a card over for the `ms` its move takes. */
  turn(uuid: number, direction: 'in' | 'out', ms: number): void {
    this.turningUuids.update((m) => new Map(m).set(uuid, direction));
    setTimeout(
      () =>
        this.turningUuids.update((m) => {
          const next = new Map(m);
          next.delete(uuid);
          return next;
        }),
      ms,
    );
  }

  /** Show a card its flyer just landed, at its new place at once; it transitions again next frame. */
  snapIntoPlace(uuid: number): void {
    this.reveal(uuid);
    this.snappedUuids.update((s) => withUuid(s, uuid, true));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.snappedUuids.update((s) => withUuid(s, uuid, false))),
    );
  }
}
