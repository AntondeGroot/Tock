import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { MoveRequest, MovesService, TestMoveResponse } from '../../../api';
import { MovePreview } from './move-preview';
import { PawnAndCardSelection, SelCard, SelPawn } from './pawn-and-card-selection';

// MovePreview takes plain constructor arguments, so it is exercised directly — no TestBed, no
// component. The one collaborator worth faking is the API service: `of(...)` answers each check
// synchronously, which keeps the recursive "adopt the split, then check again" path deterministic.

const SESSION = { sessionId: 's1', playerId: '1' };
const SEVEN: SelCard = { id: 7, value: 7 };
const PAWN_A: SelPawn = { id: '1:0', playerId: '1', tileNr: 3 };
const PAWN_B: SelPawn = { id: '1:1', playerId: '1', tileNr: 9 };

/** Queued responses, handed out one per call, so a test can script a sequence of checks. */
class FakeMovesService {
  readonly sent: MoveRequest[] = [];
  private readonly queued: TestMoveResponse[] = [];

  answerWith(...responses: TestMoveResponse[]): void {
    this.queued.push(...responses);
  }

  checkMove(
    _sessionId: string,
    _playerId: string,
    move: MoveRequest,
  ): Observable<TestMoveResponse> {
    this.sent.push(move);
    const next = this.queued.shift();
    return next ? of(next) : throwError(() => new Error('no response queued'));
  }
}

describe('MovePreview', () => {
  let moves: FakeMovesService;
  let selection: PawnAndCardSelection;
  let selectionChanged: () => void;
  let preview: MovePreview;
  /** Whether the selection currently amounts to a sendable move (the board's own check). */
  let selectionResolves: boolean;

  beforeEach(() => {
    selectionResolves = true;
    moves = new FakeMovesService();
    selection = new PawnAndCardSelection();
    selectionChanged = vi.fn();
    preview = new MovePreview(
      moves as unknown as MovesService,
      SESSION,
      selection,
      (tempMessageType) =>
        selectionResolves
          ? ({ playerId: '1', cardId: SEVEN.id, tempMessageType } as MoveRequest)
          : undefined,
      selectionChanged,
    );
  });

  /** A seven across two own pawns — the one selection that asks the server how to split it. */
  const selectASevenSplit = (): void => {
    selection.setPlayerId('1');
    selection.setCard(SEVEN);
    selection.addPawn(PAWN_A);
    selection.addPawn(PAWN_B);
  };

  // The first check of a fresh 7-split is the only time the server gets to change the selection:
  // it answers with a recommended allocation, which is adopted and then checked AGAIN, because the
  // tiles that came back describe the split that was asked about, not the one now selected.
  it('adopts the recommended split and previews the adopted move, not the one it asked about', () => {
    selectASevenSplit();
    moves.answerWith(
      {
        recommendedStepsPawn1: 3,
        recommendedStepsPawn2: 4,
        tiles: [{ playerId: '1', tileNr: 99 }],
      },
      { tiles: [{ playerId: '1', tileNr: 6 }] },
    );

    preview.refresh();

    expect([selection.getNrStepsPawn1(), selection.getNrStepsPawn2()]).toEqual([3, 4]);
    expect(selectionChanged).toHaveBeenCalled();
    // Two checks, and only two: the pending flag is cleared before the second, so adopting a
    // recommendation cannot set off another round of it.
    expect(moves.sent).toHaveLength(2);
    expect(preview.has('1', 6)).toBe(true);
    expect(preview.has('1', 99)).toBe(false);
  });

  // The server does not always have a split to recommend. That answer still CONSUMES the pending
  // flag — otherwise every later check would try to adopt again — but it must leave the selection's
  // own default (0/7) alone and simply show the tiles it came with.
  it('leaves the split alone when the server recommends nothing, and asks only once', () => {
    selectASevenSplit();
    moves.answerWith({ tiles: [{ playerId: '1', tileNr: 4 }] }); // no recommendation fields

    preview.refresh();

    expect([selection.getNrStepsPawn1(), selection.getNrStepsPawn2()]).toEqual([0, 7]);
    expect(selectionChanged).not.toHaveBeenCalled();
    expect(moves.sent).toHaveLength(1);
    expect(preview.has('1', 4)).toBe(true);
  });

  // Half a move — a card with no pawn, or a pawn the state no longer knows — is not something the
  // server can answer, so the preview must go dark rather than leave the last move's tiles pulsing
  // under a selection that no longer exists.
  it('clears the previewed tiles and sends nothing when the selection is not a move', () => {
    selectASevenSplit();
    moves.answerWith({ tiles: [{ playerId: '1', tileNr: 4 }] });
    preview.refresh();
    expect(preview.has('1', 4)).toBe(true); // a preview to lose

    selectionResolves = false;
    preview.refresh();

    expect(preview.has('1', 4)).toBe(false);
    expect(moves.sent).toHaveLength(1); // the second refresh never reached the server
  });
});
