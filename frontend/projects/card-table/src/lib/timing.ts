import { CardTableTiming, ResolvedCardTableOptions, TableLayout } from './card-table.types';

/** The out-of-the-box timings. A game retunes any subset via the table's `timing`. */
export const DEFAULT_TIMING: Required<CardTableTiming> = {
  flyMs: 500, // fly-to-pile duration (also the CSS transition + flip keyframes)
  popMs: 180, // own-card swell/glow hold before it flies
  dealFlipMs: 550, // dealt-card turnover as it fans out
  dealStaggerMs: 700, // round-robin stagger between dealt cards
  tradeRevealMs: 560, // unmask a traded-in card a frame before its flyer lands
  popScale: 1.2, // own-card swell during the pop beat
};

/** The options a table runs with: the default timings with the game's, and its deck's size. */
export function resolveOptions(
  layout: TableLayout,
  timing: CardTableTiming = {},
): ResolvedCardTableOptions {
  return { ...DEFAULT_TIMING, ...timing, deckScale: layout.deck(0, 1).scale ?? 1 };
}
