import { Component, computed, input } from '@angular/core';
import { BOARD_SIZE } from '../geometry/board-geometry';
import { TurnEdge } from './turn-edge';

// The blur eats into a glow's faded ends, so the glow runs this far past each end of the core
// line (in board units) and keeps full strength over more of its length; then the halo reaches
// as far as the line it surrounds.
const GLOW_OVERHANG = 10;

/**
 * A gold streak along the edge of the player on turn, fading out at both ends, with a slow
 * shimmer running along it. When the turn passes, the new edge flares once and settles into the
 * streak. Overlaid on the board in its own 0..600 coordinates; purely decorative.
 */
@Component({
  selector: 'app-turn-streak',
  templateUrl: './turn-streak.html',
  styleUrl: './turn-streak.scss',
})
export class TurnStreak {
  readonly edge = input<TurnEdge | undefined>(undefined);

  protected readonly viewBox = `0 0 ${BOARD_SIZE} ${BOARD_SIZE}`;

  /**
   * The current edge as a list of at most one, tracked by player: a new player on turn creates a
   * fresh element, so its flare plays, while the old one fades out (animate.leave).
   */
  protected readonly edges = computed(() => {
    const e = this.edge();
    return e ? [e] : [];
  });

  /**
   * Half the streak's and the glow's lengths. Every seat's edge is a rotation of the same one, so
   * one set of gradients serves whichever edge is shown — the leaving one included.
   */
  protected readonly half = computed(() => this.edge()?.halfLength ?? 0);
  protected readonly glowHalf = computed(() => this.half() + GLOW_OVERHANG);

  protected transformOf(e: TurnEdge): string {
    return `translate(${e.cx} ${e.cy}) rotate(${e.angle})`;
  }
}
