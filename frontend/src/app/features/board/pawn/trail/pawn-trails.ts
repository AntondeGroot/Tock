import { Component, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { BOARD_SIZE } from '../../geometry/board-geometry';
import { PawnTrail } from './pawn-trail';
import { paintTrail } from './trail-painter';
import { isTrailOver } from './trail-timeline';

const MAX_PIXEL_RATIO = 2; // sharper than this is not visible, and costs every frame

/**
 * The layer between the tiles and the pawns that moving pawns leave their trails on. It is a canvas
 * rather than elements because a streak is redrawn every frame, and it only runs while a trail is
 * still visible. Players who asked for less motion see the pawns walk without a trail.
 */
@Component({
  selector: 'app-pawn-trails',
  template: '<canvas #canvas></canvas>',
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class PawnTrails implements OnDestroy {
  /** The board's tile spacing, in board pixels. */
  readonly cell = input.required<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private trails: PawnTrail[] = [];
  private frameId: number | undefined;

  add(trails: PawnTrail[]): void {
    if (this.reducedMotion.matches || trails.length === 0) return;
    this.trails.push(...trails);
    this.frameId ??= requestAnimationFrame(this.onFrame);
  }

  ngOnDestroy(): void {
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
  }

  /** Uses the frame's own timestamp, as the pawn animator does, so a trail stays under its pawn. */
  private readonly onFrame = (now: number): void => {
    this.trails = this.trails.filter((trail) => !isTrailOver(trail, now));
    this.paint(now);
    this.frameId = this.trails.length > 0 ? requestAnimationFrame(this.onFrame) : undefined;
  };

  private paint(nowMs: number): void {
    const canvas = this.canvas().nativeElement;
    if (canvas.clientWidth === 0) return; // not laid out: nothing to see, and no size to draw at
    const size = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.setTransform(size / BOARD_SIZE, 0, 0, size / BOARD_SIZE, 0, 0);
    for (const trail of this.trails) paintTrail(ctx, trail, nowMs, this.cell());
  }
}
