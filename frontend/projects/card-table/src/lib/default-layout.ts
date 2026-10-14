import { TableLayout } from './card-table.types';

/**
 * A sensible default table: a linear hand fan below the play area, a small spiral pile at the
 * centre, and the deck on it. Games with their own board geometry give their own layout; this is
 * what Keezen uses.
 */
export const DEFAULT_LAYOUT: TableLayout = {
  hand: (index, count) => ({ x: 50 + (index - (count - 1) / 2) * 18, y: 116, rot: 0, scale: 1 }),

  pile: (index) => {
    const angle = ((90 + index * 45) * Math.PI) / 180; // each card +45° around the pile circle
    return {
      x: (315 + 10 * Math.cos(angle)) / 6, // pile centre 315px, radius 10px → board %
      y: (300 + 10 * Math.sin(angle)) / 6, // centre 300px
      rot: 0,
      scale: 0.6, // pile cards ~60px vs 100px hand
      z: 100 + index, // newest played card stacks on top
    };
  },

  // Mid-table, on the pile: cards are dealt from here, stacked small, and played back to it.
  deck: () => ({ x: 52.5, y: 50, scale: 0.3 }),
};
