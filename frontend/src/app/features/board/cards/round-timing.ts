/**
 * How long the play or forfeit that ENDS a round needs to reach the pile: a forfeit staggers its
 * cards out (up to 4 × 120ms) before the last one's 500ms flight and its 100ms landing buffer.
 */
const CARDS_SETTLE_MS = 1100;

/** The beat where the table sits still, everything settled, before the next round arrives. */
const ROUND_PAUSE_MS = 700;

/**
 * How long to hold a round's deal back: until the round's last cards have settled and the pawns
 * have stopped, plus the pause. The last cards settle CARDS_SETTLE_MS after they leave: at once
 * for a play or forfeit, but only once the pawn has stopped for a winner's leftovers.
 */
export function roundDealDelayMs(pawnsRemainingMs: number, winnerSettlesInMs = 0): number {
  return Math.max(winnerSettlesInMs + CARDS_SETTLE_MS, pawnsRemainingMs) + ROUND_PAUSE_MS;
}
