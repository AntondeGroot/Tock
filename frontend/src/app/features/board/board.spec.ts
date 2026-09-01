import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Board } from './board';
import { Translations } from '../../i18n/translations.service';
import { TeamHandoff } from '../team-handoff/team-handoff.service';

/** A pawn of `playerId` standing on `tileNr` (≥ 16 is a finish tile, i.e. home). */
const pawnOn = (playerId: string, pawnNr: number, tileNr: number) => ({
  playerId,
  pawnId: { playerId, pawnNr },
  currentTileId: { playerId, tileNr },
  nestTileId: { playerId, tileNr: -pawnNr - 1 },
});

/** Both players of one team: '1' is the viewer, '2' their teammate. */
const teamPlayers = [
  { id: '1', name: 'me', playerInt: 0, teamId: 0 },
  { id: '2', name: 'mate', playerInt: 1, teamId: 0 },
];

/**
 * A state where the viewer is on turn and the server already permits a forfeit — the hand is the
 * only thing that varies, so the deal-in is the sole reason the button's state can differ.
 */
const forfeitablePush = (playerCards: { uuid: number; suit: number; value: number }[]) => ({
  players: teamPlayers,
  pawns: [pawnOn('1', 0, 5)],
  winners: [],
  playerCards,
  currentPlayerId: '1',
  canForfeit: true,
});

describe('Board', () => {
  let component: Board;
  let fixture: ComponentFixture<Board>;

  beforeEach(async () => {
    // The board reads who is watching from the session cookie at construction, so it has to be
    // there before the component exists — the viewer identity feeds computeds that run on the
    // first change detection. No `sessionid`, so ngOnInit opens no stream.
    document.cookie = 'playerid=1';
    await TestBed.configureTestingModule({
      imports: [Board],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    document.cookie = 'playerid=; max-age=0';
    vi.useRealTimers(); // no-op unless a test installed a fake clock
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Coming home LAST of your team ends the game for that team: the winner banner pops, and there
  // is no teammate left to play for — announcing the hand-off on top of it is nonsense.
  it('does not announce the team hand-off when the teammate is already home too', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
    };
    const push = (viewerTileNr: number) => ({
      players: teamPlayers,
      pawns: [pawnOn('1', 0, viewerTileNr), pawnOn('2', 0, 17)], // the teammate is already home
      winners: [],
      playerCards: [],
    });

    c.handleGameState(push(5)); // viewer still has a pawn out on the board
    await fixture.whenStable();
    c.handleGameState(push(16)); // …and now it comes home: the team has finished
    await fixture.whenStable();

    expect(TestBed.inject(TeamHandoff).notice()).toBeNull();
  });

  // The other side of the same check: coming home FIRST does hand you your teammate's pawns, so
  // the announcement must still fire — the guard above must not silence it altogether.
  it('announces the team hand-off while the teammate still has a pawn out', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
    };
    const push = (viewerTileNr: number) => ({
      players: teamPlayers,
      pawns: [pawnOn('1', 0, viewerTileNr), pawnOn('2', 0, 5)], // the teammate is still on the board
      winners: [],
      playerCards: [],
    });

    c.handleGameState(push(12)); // viewer still has a pawn out on the board
    await fixture.whenStable();
    c.handleGameState(push(16)); // …and now it comes home, first of the team
    await fixture.whenStable();

    expect(TestBed.inject(TeamHandoff).notice()?.title).toBe(
      TestBed.inject(Translations).t('teamHandoffTitle'),
    );
  });

  // The selection side of the same rule: while the teammate is still out their pawns are yours to
  // move, but the moment they come home the offer is withdrawn — there is nothing left to play,
  // and the pawns must not stay clickable after the team has finished.
  it('stops offering the teammate pawns once the teammate is home', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      controllablePlayerIds: () => string[];
    };
    const push = (mateTileNr: number) => ({
      players: teamPlayers,
      pawns: [pawnOn('1', 0, 16), pawnOn('2', 0, mateTileNr)], // the viewer is home throughout
      winners: [],
      playerCards: [],
    });

    c.handleGameState(push(5)); // teammate still on the board → their pawns are the viewer's to play
    await fixture.whenStable();
    expect(c.controllablePlayerIds()).toEqual(['1', '2']);

    c.handleGameState(push(17)); // teammate home → nothing left to play for them
    await fixture.whenStable();
    expect(c.controllablePlayerIds()).toEqual(['1']);
  });

  // The play button is the one that would otherwise be live off-turn: a full, valid selection
  // survives the turn passing to someone else, so only the turn check can disable it.
  it('disables the play button off-turn even with a card and a pawn selected', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      selection: {
        setCard: (card: { id: number; value: number }) => void;
        addPawnById: (id: string) => void;
      };
      touch: () => void;
      canPlay: () => boolean;
    };
    const push = (currentPlayerId: string) => ({
      players: teamPlayers,
      pawns: [pawnOn('1', 0, 5)],
      winners: [],
      playerCards: [{ uuid: 7, suit: 0, value: 5 }],
      currentPlayerId,
    });

    c.handleGameState(push('1')); // the viewer's own turn
    await fixture.whenStable();
    c.selection.setCard({ id: 7, value: 5 });
    c.selection.addPawnById('1:0');
    c.touch();
    expect(c.canPlay()).toBe(true);

    c.handleGameState(push('2')); // …and the turn moves on, selection untouched
    await fixture.whenStable();
    expect(c.canPlay()).toBe(false);
  });

  // Forfeit has its own server-sent permission (`canForfeit`), and it stays true for a player who
  // has no legal move — so the turn check has to be an extra gate on top of it, not a substitute.
  it('disables the forfeit button off-turn even when the server allows a forfeit', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      canForfeit: () => boolean;
    };
    const push = (currentPlayerId: string) => ({
      players: teamPlayers,
      pawns: [pawnOn('1', 0, 5)],
      winners: [],
      playerCards: [],
      currentPlayerId,
      canForfeit: true,
    });

    c.handleGameState(push('1')); // the viewer's own turn
    await fixture.whenStable();
    expect(c.canForfeit()).toBe(true);

    c.handleGameState(push('2')); // …and the turn moves on
    await fixture.whenStable();
    expect(c.canForfeit()).toBe(false);
  });

  // The server computes `canForfeit` from the complete new hand and pushes it before a single card
  // has landed, so an enabled Forfeit button would tell the player their whole incoming hand is
  // unplayable while it is still flying in. The deal is the reveal; the button must not spoil it.
  it('keeps forfeit disabled while the new hand is still dealing in', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      canForfeit: () => boolean;
      cardTable: { dealing: () => boolean };
    };
    c.handleGameState(forfeitablePush([])); // baseline: hand empty, round over — nothing animating
    await fixture.whenStable();
    expect(c.canForfeit()).toBe(true);

    c.handleGameState(forfeitablePush([{ uuid: 7, suit: 0, value: 5 }])); // a fresh card → deal-in starts
    await fixture.whenStable();
    expect(c.cardTable.dealing()).toBe(true);
    expect(c.canForfeit()).toBe(false);
  });

  // The other half of the gate: it is a delay, not a mute. Once the last card has landed the
  // player has seen their hand, so the button must come back — a gate that never reopens would
  // leave a player with no legal move unable to end their turn at all.
  // Synchronous on purpose: `whenStable()` awaits promises, which a fake clock can stall.
  it('enables forfeit again once the deal-in has finished', () => {
    vi.useFakeTimers();
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      canForfeit: () => boolean;
      cardTable: { dealing: () => boolean };
    };
    c.handleGameState(forfeitablePush([])); // baseline, so the next push reads as a deal
    c.handleGameState(forfeitablePush([{ uuid: 7, suit: 0, value: 5 }]));
    expect(c.canForfeit()).toBe(false); // still in flight

    vi.advanceTimersByTime(3000); // past the one card's 700ms stagger + the 2s clear buffer
    expect(c.cardTable.dealing()).toBe(false);
    expect(c.canForfeit()).toBe(true);
  });

  // A trade flies a card into the hand exactly like a deal does, so the naive "something is
  // animating" gate would catch it too — but you ASKED for that King, you already know what it is.
  // Nothing to spoil, and disabling forfeit mid-swap would just look broken.
  it('leaves forfeit enabled while a single traded-in card animates', async () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      canForfeit: () => boolean;
      cardTable: { dealing: () => boolean };
    };
    const king = { uuid: 7, suit: 0, value: 13 };
    const ace = { uuid: 9, suit: 1, value: 1 };

    c.handleGameState(forfeitablePush([king])); // baseline: a settled one-card hand
    await fixture.whenStable();

    c.handleGameState(forfeitablePush([ace])); // the trade: king out, ace in — the hand never grows
    await fixture.whenStable();
    expect(c.cardTable.dealing()).toBe(true); // the incoming card IS animating…
    expect(c.canForfeit()).toBe(true); // …but it is not a round deal, so the button stays live
  });

  // Card uuids are reused across rounds; the client pile must be cleared on a new deal or a
  // redealt card (whose uuid lingered in the pile) gets filtered out of the hand and vanishes.
  it('clears the pile on a new round so a redealt card is not filtered out of the hand', () => {
    const c = component as unknown as {
      handleGameState: (push: unknown) => void;
      cardTable: {
        pile: { set: (v: { uuid: number; suit: number; value: number }[]) => void };
        cards: () => { uuid: number; inPile: boolean }[];
      };
    };
    const card = (uuid: number, suit: number, value: number) => ({ uuid, suit, value });
    const push = (cards: { uuid: number; suit: number; value: number }[]) => ({
      playerCards: cards,
      players: [],
      pawns: [],
      winners: [],
    });

    // Round 1: three cards dealt, then played one by one (each lands in the pile as it flies).
    c.handleGameState(push([card(1, 0, 5), card(2, 0, 6), card(3, 0, 7)]));
    c.cardTable.pile.set([card(1, 0, 5)]);
    c.handleGameState(push([card(2, 0, 6), card(3, 0, 7)]));
    c.cardTable.pile.set([card(1, 0, 5), card(2, 0, 6)]);
    c.handleGameState(push([card(3, 0, 7)]));
    c.cardTable.pile.set([card(1, 0, 5), card(2, 0, 6), card(3, 0, 7)]);
    c.handleGameState(push([])); // hand empty — round over

    // New round: the deck reuses uuids, so cards 1 and 2 return in a fresh hand.
    c.handleGameState(push([card(1, 1, 9), card(2, 1, 10)]));

    const shown = c.cardTable
      .cards()
      .filter((x) => !x.inPile)
      .map((x) => x.uuid)
      .sort();
    expect(shown).toEqual([1, 2]); // both visible — pile was cleared on the new deal
  });
});
