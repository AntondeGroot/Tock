import { signal } from '@angular/core';
import { MoveRequest, MovesService } from '../../../api';
import { GameSessionRef } from '../../../session';
import { PawnAndCardSelection } from './pawn-and-card-selection';

/** A previewed landing tile, keyed the way the board renders tiles: "playerId:tileNr". */
function tileKey(playerId: string, tileNr: number): string {
  return `${playerId}:${tileNr}`;
}

/**
 * The live move preview: every time the selection changes, ask the server which tile(s) the move
 * would land on and hold them for the board to pulse. Mirrors the GWT presenter's checkMove().
 *
 * It also owns the one place the server gets to decide something about the selection: when a
 * 7-split first forms, the check answers with a recommended allocation, which is adopted once and
 * then re-checked so the preview shows that split. Requests are fire-and-forget — a failed preview
 * is not worth telling the player about, it just leaves the previous tiles alone.
 */
export class MovePreview {
  private readonly landingTiles = signal<Set<string>>(new Set());

  constructor(
    private readonly moves: MovesService,
    private readonly session: GameSessionRef,
    private readonly selection: PawnAndCardSelection,
    /** The current selection as a request, or undefined when it isn't a resolvable move yet. */
    private readonly moveRequest: (type: MoveRequest['tempMessageType']) => MoveRequest | undefined,
    /** Announce that the preview changed the selection (the split default), so the view updates. */
    private readonly selectionChanged: () => void,
  ) {}

  /** Whether the previewed move would land on this tile. */
  has(playerId: string, tileNr: number): boolean {
    return this.landingTiles().has(tileKey(playerId, tileNr));
  }

  /** The previewed landing tiles, as keys — for deriving which of them capture a teammate. */
  readonly tiles = this.landingTiles.asReadonly();

  /** Drop the preview: the selection is gone, or a move is being submitted. */
  clear(): void {
    this.landingTiles.set(new Set());
  }

  /** Re-run the preview for the current selection. */
  refresh(): void {
    const { sessionId, playerId } = this.session;
    const move = this.moveRequest('CHECK_MOVE');
    if (!move || !sessionId || !playerId) {
      this.clear();
      return;
    }
    this.moves.checkMove(sessionId, playerId, move).subscribe({
      next: (res) => {
        if (this.adoptRecommendedSplit(res.recommendedStepsPawn1, res.recommendedStepsPawn2)) {
          return; // the adopted split re-runs the preview; these tiles are for the old one
        }
        // Highlight the landing tile(s) — the last tile of each pawn's path.
        this.landingTiles.set(new Set((res.tiles ?? []).map((t) => tileKey(t.playerId, t.tileNr))));
      },
      error: () => {
        /* fire-and-forget: errors are non-critical here */
      },
    });
  }

  /**
   * First time a 7-split forms, take the server's recommended allocation and preview that instead.
   * Returns whether it did, in which case a fresh preview is already on its way.
   */
  private adoptRecommendedSplit(stepsPawn1?: number, stepsPawn2?: number): boolean {
    if (!this.selection.isSplitDefaultPending()) return false;
    this.selection.clearSplitDefaultPending();

    const pawn1 = stepsPawn1 ?? -1;
    const pawn2 = stepsPawn2 ?? -1;
    if (pawn1 < 0 || pawn2 < 0) return false;

    this.selection.setNrStepsPawn1(pawn1);
    this.selection.setNrStepsPawn2(pawn2);
    this.selectionChanged();
    this.refresh();
    return true;
  }
}
