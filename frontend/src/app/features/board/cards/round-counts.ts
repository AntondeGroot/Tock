/** Cards held per player, by player id — the viewer's own hand included. */
export type HandCounts = Record<string, number>;

/**
 * Whether a push deals a new round: some hand grew, as only a deal adds cards — a trade swaps one
 * for one. Read from every count, the viewer's own included, so it also sees the deal for a viewer
 * who is dealt nothing (finished, or only watching).
 */
export function isRoundDeal(before: HandCounts, after: HandCounts): boolean {
  return Object.entries(after).some(([id, n]) => n > (before[id] ?? 0));
}

/**
 * Whether some hand lost more than one card: with a move, that is a win — the played card and the
 * leftovers the server throws away. A player who left is not counted; their fan is gone.
 */
export function hasLeftovers(before: HandCounts, after: HandCounts): boolean {
  return Object.entries(before).some(([id, n]) => n - (after[id] ?? n) > 1);
}

/** Every count set to zero — what the table really holds the moment a round ends. */
export function allEmpty(counts: HandCounts): HandCounts {
  return Object.fromEntries(Object.keys(counts).map((id) => [id, 0]));
}
