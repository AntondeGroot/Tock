import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Board } from './board';
import { GameStatePush, provideApi } from '../../api';
import { Translations } from '../../i18n/translations.service';
import { MoveRejection } from './feedback/move-rejected/move-rejection.service';

// Characterization tests for the board's TURN ACTIONS — playing the selected card and forfeiting.
// They pin what the code does TODAY (the request it sends, what it clears, where the card goes) so
// the play/forfeit logic can be extracted out of board.ts without changing behaviour. They drive
// the component's own methods rather than the DOM: the subject here is the submit path, not the
// template.

const SESSION = 's1';
const VIEWER = '1';

// Unlike the other board specs this one needs a `sessionid` — playCard/forfeit early-return
// without one — so ngOnInit really does open the stream. jsdom has no EventSource; an inert stub
// lets the component initialise while the state is fed directly through handleGameState instead.
class InertEventSource {
  onerror: (() => void) | null = null;
  readyState = 0;
  addEventListener(): void {
    /* no events are delivered in these tests */
  }
  close(): void {
    /* nothing to close */
  }
}

/** The viewer's own pawn, standing on a normal board tile (not the nest, not the finish). */
const viewerPawn = {
  playerId: VIEWER,
  pawnId: { playerId: VIEWER, pawnNr: 0 },
  currentTileId: { playerId: VIEWER, tileNr: 5 },
  nestTileId: { playerId: VIEWER, tileNr: -1 },
};

const PAWN_KEY = `${VIEWER}:0`;
const CARD = { uuid: 7, suit: 0, value: 5 };
// A King only ever brings a pawn OUT of the nest, so playing it on a pawn already on the board
// is the selection the board refuses by itself, without asking the server.
const KING = { uuid: 9, suit: 0, value: 13 };
/** An opponent's public play, in the wire's "suit_value" form: the jack of the third suit. */
const OPPONENT_PLAY = '2_11';
/** Three cards leaving one hand at once: nobody plays three, so the board reads it as a forfeit. */
const OPPONENT_FORFEIT = ['0_2', '1_3', '2_4'];

/** The viewer on turn, one pawn on the board, holding a playable five and an unplayable King. */
const playableState = (): GameStatePush =>
  ({
    currentPlayerId: VIEWER,
    version: 1,
    players: [
      { id: VIEWER, name: 'me', playerInt: 0 },
      { id: '2', name: 'other', playerInt: 1 },
    ],
    pawns: [viewerPawn],
    winners: [],
    playerCards: [CARD, KING],
  }) as GameStatePush;

/** The same state, with the opponent holding `opponentCards` and `played` face-up on the pile. */
const stateWithCounts = (opponentCards: number, played: string[]): GameStatePush => ({
  ...playableState(),
  nrOfCardsPerPlayer: { [VIEWER]: 2, '2': opponentCards },
  playedCards: played,
});

/** The board members these tests drive; all `protected` on the component. */
interface BoardInternals {
  handleGameState(push: GameStatePush): void;
  selection: {
    selectCard(uuid: number): void;
    selectPawn(id: string): void;
    cardUuid(): number | undefined;
  };
  playCard(): void;
  forfeit(): void;
  cardTable: { flyers(): { suit: number; value: number }[] };
}

describe('Board turn actions', () => {
  let fixture: ComponentFixture<Board>;
  let board: BoardInternals;
  let http: HttpTestingController;
  let originalEventSource: unknown;

  const env = globalThis as Record<string, unknown>;

  beforeEach(async () => {
    originalEventSource = env['EventSource'];
    env['EventSource'] = InertEventSource;
    document.cookie = `playerid=${VIEWER}`;
    document.cookie = `sessionid=${SESSION}`;

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi('')],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    http = TestBed.inject(HttpTestingController);
    board = fixture.componentInstance as unknown as BoardInternals;
    board.handleGameState(playableState());
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers(); // no-op unless a test installed a fake clock
    document.cookie = 'playerid=; max-age=0';
    document.cookie = 'sessionid=; max-age=0';
    env['EventSource'] = originalEventSource;
  });

  /** Select a card and the pawn, answering the move preview the pawn click sets off. */
  const selectMoveWith = (cardUuid: number = CARD.uuid): void => {
    board.selection.selectCard(cardUuid);
    board.selection.selectPawn(PAWN_KEY);
    http.expectOne(`/moves/${SESSION}/${VIEWER}/test`).flush({ tiles: [] });
    fixture.detectChanges();
  };

  it('sends the selected card and pawn, then clears the selection and flies the card to the pile', () => {
    selectMoveWith();

    board.playCard();

    const submitted = http.expectOne(`/moves/${SESSION}/${VIEWER}`);
    expect(submitted.request.body).toMatchObject({
      playerId: VIEWER,
      cardId: CARD.uuid,
      pawn1Id: { playerId: VIEWER, pawnNr: 0 },
      tempMessageType: 'MAKE_MOVE',
    });

    submitted.flush({ result: 'CAN_MAKE_MOVE' });
    fixture.detectChanges();

    // Accepted: the selection is dropped, and the played card leaves the hand as a flyer heading
    // for the pile (it lands there on a timer, which these tests deliberately don't wait for).
    expect(board.selection.cardUuid()).toBeUndefined();
    expect(board.cardTable.flyers().map((f) => f.value)).toEqual([CARD.value]);
  });

  // The server can refuse a move with a 200 and a reason (the rules said no, nothing went wrong).
  // That path must NOT behave like an accepted play: the card stays in the hand and the selection
  // survives, so the player can adjust it — only the explanation is new.
  it('explains a rules rejection and keeps the selection so the move can be adjusted', () => {
    selectMoveWith();

    board.playCard();
    http
      .expectOne(`/moves/${SESSION}/${VIEWER}`)
      .flush({ result: 'CANNOT_MAKE_MOVE', rejectionReason: 'DESTINATION_BLOCKED' });
    fixture.detectChanges();

    expect(TestBed.inject(MoveRejection).message()).toBe(
      TestBed.inject(Translations).t('moveRejectedDestinationBlocked'),
    );
    expect(board.selection.cardUuid()).toBe(CARD.uuid);
    expect(board.cardTable.flyers()).toEqual([]);
  });

  // Some selections the server answers with a bare 400 and no reason, which the error branch would
  // report as the misleading "not your turn". The board recognises those itself — and when it does,
  // it must explain the REAL problem and send nothing at all.
  it('explains a locally-rejected selection without contacting the server', () => {
    selectMoveWith(KING.uuid);

    board.playCard();

    expect(TestBed.inject(MoveRejection).message()).toBe(
      TestBed.inject(Translations).t('moveRejectedPawnNotOnNest'),
    );
    http.expectNone(`/moves/${SESSION}/${VIEWER}`);
  });

  // Forfeiting discards the WHOLE hand. The cards leave one at a time rather than all at once —
  // the same 120ms stagger an opponent's forfeit gets — so the pile reads as a sequence of
  // discards. The selection goes with them: there is nothing left to play.
  it('forfeits the turn, clearing the selection and discarding the hand one card at a time', () => {
    selectMoveWith();
    vi.useFakeTimers();

    board.forfeit();

    expect(http.expectOne(`/cards/${SESSION}/${VIEWER}`).request.method).toBe('DELETE');
    expect(board.selection.cardUuid()).toBeUndefined();

    vi.advanceTimersByTime(119); // the first discard is away, the second still waiting
    expect(board.cardTable.flyers()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(board.cardTable.flyers()).toHaveLength(2);
  });

  // An opponent's hand is only ever known as a COUNT, so a play is inferred from that count
  // dropping by exactly one: the outermost card of their fan flies to the pile, face-down, and
  // turns over on the way. A bigger drop is a forfeit and gets its own staggered animation.
  it('flies an opponent card to the pile when their count drops by one', async () => {
    board.handleGameState(stateWithCounts(4, [])); // the baseline the next push is compared against
    await fixture.whenStable();
    board.handleGameState(stateWithCounts(3, [OPPONENT_PLAY]));
    await fixture.whenStable();

    expect(board.cardTable.flyers()).toEqual([expect.objectContaining({ suit: 2, value: 11 })]);
  });

  // The same count diff, one card bigger, means something else entirely: a forfeit. Those cards
  // must NOT go out the single-play way (immediately, one card) but staggered, one per 120ms —
  // otherwise a discarded hand lands on the pile as a single card and the rest never appear.
  it('staggers an opponent forfeit when their count drops by more than one', () => {
    board.handleGameState(stateWithCounts(4, []));
    fixture.detectChanges();

    vi.useFakeTimers();
    board.handleGameState(stateWithCounts(1, OPPONENT_FORFEIT));
    fixture.detectChanges();

    // Nothing has left yet: unlike a single play, every forfeited card waits for its turn.
    expect(board.cardTable.flyers()).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(board.cardTable.flyers()).toHaveLength(1);
    vi.advanceTimersByTime(240);
    expect(board.cardTable.flyers()).toHaveLength(3);
  });
});
