import { CardPositioner, Pos } from './card-table.types';

/**
 * A sensible default table layout: a linear hand fan below the play area and a small spiral pile at
 * the centre. Games with their own board geometry can supply a different {@link CardPositioner};
 * this is what Keezen uses (its previous inline layout, unchanged).
 */
export class DefaultCardPositioner implements CardPositioner {
  handSlot(index: number, count: number): Pos {
    return { x: 50 + (index - (count - 1) / 2) * 18, y: 116, rot: 0, scale: 1 };
  }

  pileSlot(index: number): Pos {
    const angle = ((90 + index * 45) * Math.PI) / 180; // each card +45° around the pile circle
    return {
      x: (315 + 10 * Math.cos(angle)) / 6, // pile centre 315px, radius 10px → board %
      y: (300 + 10 * Math.sin(angle)) / 6, // centre 300px
      rot: 0,
      scale: 0.6, // pile cards ~60px vs 100px hand
      z: 100 + index, // newest played card stacks on top
    };
  }

  pileCenter(): Pos {
    return { x: 52.5, y: 50 };
  }
}
