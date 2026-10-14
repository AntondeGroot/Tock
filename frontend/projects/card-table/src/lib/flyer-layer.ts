import { signal } from '@angular/core';
import { Flyer, Pos } from './card-table.types';

/**
 * The flyer layer: transient face-up copies of cards, drawn above the table while they travel —
 * an opponent's play, a trade swap. Each is launched at its start, moved by patching it (the CSS
 * transition animates the change) and removed once it has landed.
 */
export class FlyerLayer {
  private readonly all = signal<Flyer[]>([]);
  /** Every flyer in the air, for the layer to draw. */
  readonly flyers = this.all.asReadonly();
  private seq = 0;

  /** Put a flyer on the table at its start; returns its id, to move and remove it by. */
  launch(start: Omit<Flyer, 'id'>): number {
    const id = ++this.seq;
    this.all.update((f) => [...f, { id, ...start }]);
    return id;
  }

  /** Patch one flyer in the air (position/scale/glow) — its transition animates the change. */
  update(id: number, patch: Partial<Flyer>): void {
    this.all.update((f) => f.map((fl) => (fl.id === id ? { ...fl, ...patch } : fl)));
  }

  /** Drop a flyer once it has landed. */
  remove(id: number): void {
    this.all.update((f) => f.filter((fl) => fl.id !== id));
  }

  /**
   * Fly a face-up card from one point to another and drop it there after `landMs` — the moving
   * parts of a trade swap. Moved on the frame after it appears, so the transition has a start.
   */
  flyBetween(
    from: Pos,
    to: Pos,
    face: { suit: number; value: number },
    opts: { fromScale: number; toScale: number; flip?: 'in' | 'out' },
    landMs: number,
  ): void {
    const id = this.launch({
      x: from.x,
      y: from.y,
      rot: 0,
      scale: opts.fromScale,
      suit: face.suit,
      value: face.value,
      flip: opts.flip,
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.update(id, { x: to.x, y: to.y, scale: opts.toScale })),
    );
    setTimeout(() => this.remove(id), landMs);
  }
}
