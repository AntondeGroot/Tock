import { beforeEach, describe, expect, it } from 'vitest';
import { Observable, of } from 'rxjs';
import { Card as CardModel, MoveRequest, MovesService, TestMoveResponse } from '../../../api';
import { MoveSelection, SelectableState } from './move-selection';

const SESSION = { sessionId: 's1', playerId: '1' };
const VIEWER = '1';
const PAWN_KEY = '1:0';
const FIVE: CardModel = { uuid: 5, suit: 0, value: 5 };

/** Records every move check so a test can count how often the board asked the server. */
class FakeMovesService {
  readonly sent: MoveRequest[] = [];

  checkMove(
    _sessionId: string,
    _playerId: string,
    move: MoveRequest,
  ): Observable<TestMoveResponse> {
    this.sent.push(move);
    return of({ tiles: [] });
  }
}

describe('MoveSelection', () => {
  let moves: FakeMovesService;
  let selection: MoveSelection;

  beforeEach(() => {
    moves = new FakeMovesService();
    selection = new MoveSelection(moves as unknown as MovesService, SESSION, (id) => ({
      pawnId: { playerId: VIEWER, pawnNr: Number(id.split(':')[1]) },
    }));
  });

  /** One push: the viewer holding a five, with their only pawn standing on `tileNr`. */
  const pushWithPawnOn = (tileNr: number, version = 1): SelectableState => ({
    version,
    viewerId: VIEWER,
    controllablePlayerIds: [VIEWER],
    pawns: [{ id: PAWN_KEY, playerId: VIEWER, tileNr }],
    hand: [FIVE],
    pileUuids: new Set<number>(),
  });

  // A preview describes where the move lands FROM the pawn's current tile. Anything that moves that
  // pawn while the selection stands — an opponent's Jack switch, or the pawn being captured and
  // sent home — invalidates it, so the pulsing tiles must be recomputed against the new position
  // rather than left describing a move from a tile the pawn has left.
  it('re-previews the selected move when a push moves the board under it', () => {
    selection.sync(pushWithPawnOn(3, 1));
    selection.selectCard(FIVE.uuid);
    selection.selectPawn(PAWN_KEY);
    expect(moves.sent).toHaveLength(1); // the preview for the move as selected

    selection.sync(pushWithPawnOn(9, 2)); // an opponent moved the pawn out from under the selection

    expect(moves.sent).toHaveLength(2);
  });

  // sync() runs off an effect that re-fires on more than just new pushes (the hand, the pile and
  // the controllable players all feed it), and a reconnect re-delivers the snapshot it already has.
  // The version is what says the board actually moved, so re-runs at the same version must stay
  // silent — otherwise a standing selection trickles check requests at the server for nothing.
  it('does not re-preview when the same version arrives again', () => {
    selection.sync(pushWithPawnOn(3, 1));
    selection.selectCard(FIVE.uuid);
    selection.selectPawn(PAWN_KEY);
    expect(moves.sent).toHaveLength(1);

    selection.sync(pushWithPawnOn(3, 1)); // the same board, re-delivered
    selection.sync(pushWithPawnOn(3, 1));

    expect(moves.sent).toHaveLength(1);
  });
});
