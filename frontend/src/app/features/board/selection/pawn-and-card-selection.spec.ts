import { beforeEach, describe, expect, it } from 'vitest';
import { PawnAndCardSelection, type SelCard, type SelPawn } from './pawn-and-card-selection';

// Ports of the GWT client's PawnAndCardSelection*Test suites (JUnit -> Vitest).
// Helpers mirror the Java setup: PawnClient(playerId, pawnNr, TileId(_, tileNr))
// and CardClient(suit, value). Card identity is the uuid; the Java tests reuse
// the same instance for "click the same card again", so we reuse objects too.

let uuid = 0;
const card = (value: number): SelCard => ({ id: ++uuid, value });
const pawn = (playerId: string, pawnNr: number, tileNr: number): SelPawn => ({
  id: `${playerId}:${pawnNr}`,
  playerId,
  tileNr,
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection', () => {
  let sel: PawnAndCardSelection;
  const ownPawnOnBoard = pawn('1', 1, 0);
  const ownPawnOnBoard2 = pawn('1', 2, 5);
  const otherPawn = pawn('2', 1, 0);
  const otherPawnOnNest = pawn('2', 3, -1);
  const otherPawnOnFinish = pawn('2', 4, 16);
  let jackCard: SelCard;
  let nonJackCard: SelCard;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    jackCard = card(11);
    nonJackCard = card(5);
  });

  it('clickOnOwnPawn_IsPawn1', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getPawnId1()).toBe(ownPawnOnBoard.id);
    expect(sel.getPawn2()).toBeNull();
  });

  it('clickOnOtherPawn_CannotSelect', () => {
    sel.setPlayerId('1');
    sel.addPawn(otherPawn);
    expect(sel.getPawnId1()).not.toBe(otherPawn.id);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('testAddPawnSamePlayer', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
    // Deselect the same pawn
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getPawnId1()).toBeNull();
  });

  it('testAddPawnDifferentPlayerWithoutJack', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setPlayerId('2');
    sel.setCard(nonJackCard);
    sel.addPawn(otherPawn);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('testSetAndGetCard', () => {
    sel.setCard(jackCard);
    expect(sel.getCard()).toBe(jackCard);
    sel.setCard(nonJackCard);
    expect(sel.getCard()).toBe(nonJackCard);
  });

  it('testDrawCardsFlag', () => {
    sel.setCardsAreDrawn();
    expect(sel.getDrawCards()).toBe(false);
    sel.setCard(jackCard);
    expect(sel.getDrawCards()).toBe(true);
  });

  it('deselectCard_doesNotDeselectPawn', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(nonJackCard);
    // deselect card by clicking it again
    sel.setCard(nonJackCard);
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
  });

  it('testReset', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.reset();
    expect(sel.getPawnId1()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getCard()).toBeNull();
    expect(sel.getDrawCards()).toBe(true);

    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(card(1));
    sel.reset();
    expect(sel.getNrStepsPawn1()).toBe(0);
    expect(sel.getNrStepsPawn2()).toBe(0);
  });

  it('withJack_CannotSelectOtherPawnOnNest', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnBoard2);
    sel.addPawn(otherPawnOnNest);
    expect(sel.getPawnId1()).toBe(ownPawnOnBoard2.id);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withJack_CannotSelectOtherPawnOnFinish', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnBoard2);
    sel.addPawn(otherPawnOnFinish);
    expect(sel.getPawnId1()).toBe(ownPawnOnBoard2.id);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('ownPawn_plainCard_thenClickOpponent_withJackInHand_inferSwitch', () => {
    const two = card(2);
    sel.setPlayerId('1');
    sel.setHand([two, jackCard]);
    sel.addPawn(ownPawnOnBoard); // own board pawn = pawn1
    sel.setCard(two); // a plain number selected for a normal move
    expect(sel.getMoveType()).toBe('move');

    // Clicking an opponent's board pawn now reads as switch intent: the Jack is auto-selected.
    sel.addPawn(otherPawn);

    expect(sel.getCard()).toBe(jackCard);
    expect(sel.getPawnId1()).toBe(ownPawnOnBoard.id);
    expect(sel.getPawnId2()).toBe(otherPawn.id);
    expect(sel.getMoveType()).toBe('switch');
  });

  it('ownPawn_plainCard_thenClickOpponent_withoutJackInHand_doesNothing', () => {
    const two = card(2);
    sel.setPlayerId('1');
    sel.setHand([two]); // no Jack to switch with
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(two);

    sel.addPawn(otherPawn);

    expect(sel.getCard()).toBe(two); // plain card kept
    expect(sel.getPawnId2()).toBeNull(); // no switch inferred
    expect(sel.getMoveType()).toBe('move');
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionAceTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - Ace', () => {
  let sel: PawnAndCardSelection;
  const ownPawnOnBoard = pawn('1', 1, 0);
  const ownPawnOnNest = pawn('1', 2, -1);
  const ownPawnOnFinish = pawn('1', 3, 16);
  const ace = () => card(1);

  beforeEach(() => {
    sel = new PawnAndCardSelection();
  });

  it('setAce_SelectPawnOffBoard_MoveOnBoard', () => {
    sel.setPlayerId('1');
    sel.setCard(ace());
    sel.addPawn(ownPawnOnNest);
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('selectPawnOffBoard_SetAce_MoveOnBoard', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnNest);
    sel.setCard(ace());
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('setAce_SelectPawnOnBoard_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.setCard(ace());
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getMoveType()).toBe('move');
  });

  it('selectPawnOnBoard_SelectAce_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(ace());
    expect(sel.getMoveType()).toBe('move');
  });

  it('setAce_SelectPawnOnFinish_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.setCard(ace());
    sel.addPawn(ownPawnOnFinish);
    expect(sel.getMoveType()).toBe('move');
  });

  it('selectPawnOnFinish_SelectAce_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnFinish);
    sel.setCard(ace());
    expect(sel.getMoveType()).toBe('move');
  });

  it('selectAce_ThenForfeit_Resets', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(ace());
    sel.setMoveType('forfeit');
    expect(sel.getMoveType()).toBe('forfeit');
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawnId1()).toBeNull();
  });

  it('selectPawnTwice_Deselects', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(ace());
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getPawnId1()).toBeNull();
  });

  it('ONBOARD_SetAce_NonAce_ThenAce_MOVEStillONBOARD', () => {
    sel.setPlayerId('1');
    const theAce = ace();
    sel.setCard(theAce);
    sel.addPawn(ownPawnOnNest);
    sel.setCard(card(5)); // non-ace deselects the pawn
    sel.setCard(theAce);
    expect(sel.getMoveType()).toBe('onBoard');
    expect(sel.getNrStepsPawn1()).toBe(0);
  });

  it('pawnOnBoard_SelectAce_Move', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(card(5));
    sel.setCard(ace());
    expect(sel.getMoveType()).toBe('move');
    expect(sel.getNrStepsPawn1()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionSevenTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - Seven', () => {
  let sel: PawnAndCardSelection;
  let ownPawnOnBoard: SelPawn;
  let ownPawnOnBoard2: SelPawn;
  let ownPawnOnNest: SelPawn;
  let ownPawnOnFinish: SelPawn;
  let otherPawnOnBoard: SelPawn;
  let sevenCard: SelCard;
  let nonJackCard: SelCard;
  let jackCard: SelCard;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    ownPawnOnBoard = pawn('1', 1, 0);
    ownPawnOnBoard2 = pawn('1', 2, 0);
    ownPawnOnNest = pawn('1', 3, -1);
    ownPawnOnFinish = pawn('1', 4, 16);
    otherPawnOnBoard = pawn('2', 1, 0);
    sevenCard = card(7);
    nonJackCard = card(5);
    jackCard = card(11);
  });

  it('withSeven_Select2Pawns_MoveTypeSplit', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getMoveType()).toBe('split');
  });

  it('withSeven_PawnOnNest_PossibleToSelect', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
    expect(sel.getCard()).toBe(sevenCard);
  });

  it('withSeven_SelectPawn_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getMoveType()).toBe('move');
  });

  it('withSeven_PawnOnFinish_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnFinish);
    expect(sel.getMoveType()).toBe('move');
    expect(sel.getPawn1()).toBe(ownPawnOnFinish);
  });

  it('withSeven_PawnOnBoardAndFinish_Possible', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getMoveType()).toBe('move');
    sel.addPawn(ownPawnOnFinish);
    expect(sel.getMoveType()).toBe('split');
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
    expect(sel.getPawn2()).toBe(ownPawnOnFinish);
  });

  it('withSeven_SelectTwoOwnPawnsOnBoard', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
    expect(sel.getPawn2()).toBe(ownPawnOnBoard2);
  });

  it('withSeven_CanOnlySelectOwnPawn', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getMoveType()).toBe('move');
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withSeven_SelectTwoPawns_SetOtherCard_DeselectPawn2', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    sel.setCard(nonJackCard);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withSeven_CanSelectSecondPawnOnNest', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getPawn2()).toBe(ownPawnOnNest);
    expect(sel.getCard()).toBe(sevenCard);
    expect(sel.getMoveType()).toBe('split');
  });

  it('withSeven_SelectPawn_DeselectSecondPawn_MoveTypeMove', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getMoveType()).toBe('split');
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getMoveType()).toBe('move');
  });

  it('withSeven_SelectPawn_nrStepsIs7', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getNrStepsPawn1()).toBe(7);
  });

  it('withSeven_Select2Pawns_DeselectPawn1_Pawn2IsNowPawn1', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getNrStepsPawn1()).toBe(7);
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getPawn1()).toBe(ownPawnOnBoard2);
  });

  it('withSeven_Select2Pawns_SetJack_DeselectsPawn2_bugfix', () => {
    sel.setPlayerId('1');
    sel.setCard(sevenCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    sel.setCard(jackCard);
    expect(sel.getPawnId2()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionJackTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - Jack', () => {
  let sel: PawnAndCardSelection;
  let ownPawnOnBoard: SelPawn;
  let ownPawnOnNest: SelPawn;
  let ownPawnOnFinish: SelPawn;
  let otherPawnOnBoard: SelPawn;
  let otherPawnOnNest: SelPawn;
  let otherPawnOnFinish: SelPawn;
  let jackCard: SelCard;
  let nonJackCard: SelCard;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    ownPawnOnBoard = pawn('1', 1, 0);
    ownPawnOnNest = pawn('1', 2, -1);
    ownPawnOnFinish = pawn('1', 3, 16);
    otherPawnOnBoard = pawn('2', 1, 0);
    otherPawnOnNest = pawn('2', 2, -1);
    otherPawnOnFinish = pawn('2', 3, 16);
    jackCard = card(11);
    nonJackCard = card(5);
  });

  it('withJack_SelectNestPawn_PossibleToSelect', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
    expect(sel.getCard()).toBe(jackCard);
  });

  it('test_SelectNestPawn_SetJack_PossibleToSelect', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnNest);
    sel.setCard(jackCard);
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
    expect(sel.getCard()).toBe(jackCard);
  });

  it('withJack_SelectPawnOnBoard_AndOnNest_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(otherPawnOnNest);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('test_SelectPawnOnBoard_SelectPawnOnFinish_NotPossible', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnFinish);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withJack_SelectPawnOnBoard_MoveTypeIsSwitch', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getMoveType()).toBe('switch');
  });

  it('selectPawnOnBoard_SetJack_MoveTypeIsSwitch', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    expect(sel.getMoveType()).toBe('switch');
  });

  it('withJack_SelectPawnOnFinish_PossibleToSelect', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnFinish);
    expect(sel.getPawn1()).toBe(ownPawnOnFinish);
    expect(sel.getCard()).toBe(jackCard);
  });

  it('test_SelectPawnOnFinish_SelectJack_PossibleToSelect', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnFinish);
    sel.setCard(jackCard);
    expect(sel.getPawn1()).toBe(ownPawnOnFinish);
    expect(sel.getCard()).toBe(jackCard);
  });

  it('withJack_Forfeit_ResetsCardAndPawn', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.setMoveType('forfeit');
    expect(sel.getMoveType()).toBe('forfeit');
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawnId1()).toBeNull();
  });

  it('selectPawnTwice_Deselects', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.addPawn(ownPawnOnBoard);
    expect(sel.getPawnId1()).toBeNull();
  });

  it('withJack_ClickOnlyOnOpponent_Possible', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawnId1()).not.toBe(otherPawnOnBoard.id);
    expect(sel.getPawnId2()).toBe(otherPawnOnBoard.id);
  });

  it('withoutJack_clickOnOtherPawn_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(nonJackCard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawnId1()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
  });

  it('selectTwoPawnsWithJack_SetNormalCard_OnlyOwnPawnIsSelected', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawnId2()).toBe(otherPawnOnBoard.id);
    sel.setCard(nonJackCard);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withJack_AddOtherPawnTwice_Deselects', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawn2()).toBe(otherPawnOnBoard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withoutJack_DeselectsOtherPawn', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnBoard);
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnBoard);
    sel.setCard(nonJackCard);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withJack_SelectOtherPawnOnNest_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnNest);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withJack_SelectOtherPawnOnFinish_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(jackCard);
    sel.addPawn(otherPawnOnFinish);
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withoutJack_ThenJack_ResetsStepsPawn1', () => {
    sel.setCard(card(5));
    sel.setCard(jackCard);
    expect(sel.getNrStepsPawn1()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionKingTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - King', () => {
  let sel: PawnAndCardSelection;
  let ownPawnOnNest: SelPawn;
  let ownPawnOnFinish: SelPawn;
  let otherPawnOnNest: SelPawn;
  let otherPawnOnFinish: SelPawn;
  let kingCard: SelCard;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    ownPawnOnNest = pawn('1', 2, -1);
    ownPawnOnFinish = pawn('1', 3, 16);
    otherPawnOnNest = pawn('2', 1, -1);
    otherPawnOnFinish = pawn('2', 2, 16);
    kingCard = card(13);
  });

  it('withKing_SelectPawnOffBoard_MoveTypeOBoard', () => {
    sel.setPlayerId('1');
    sel.setCard(kingCard);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('selectPawnOffBoard_SetKing_MoveTypeOnBoard', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnNest);
    sel.setCard(kingCard);
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('withKing_SelectOtherPawnOnNest_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(kingCard);
    sel.addPawn(otherPawnOnNest);
    expect(sel.getPawnId1()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
  });

  it('withKing_SelectOtherPawnOnFinish_NotPossible', () => {
    sel.setPlayerId('1');
    sel.setCard(kingCard);
    sel.addPawn(otherPawnOnFinish);
    expect(sel.getPawnId1()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
  });

  it('selectOwnPawnOnFinish_SetKing_Possible', () => {
    sel.setPlayerId('1');
    sel.addPawn(ownPawnOnFinish);
    sel.setCard(kingCard);
    expect(sel.getPawnId1()).toBe(ownPawnOnFinish.id);
    expect(sel.getCard()).toBe(kingCard);
  });

  it('withNormalCard_ThenKing_ResetsStepsPawn1', () => {
    sel.setCard(card(5));
    sel.setCard(kingCard);
    expect(sel.getNrStepsPawn1()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionAutoSelectTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - AutoSelect', () => {
  let sel: PawnAndCardSelection;
  let ownPawnOnBoard: SelPawn;
  let ownPawnOnBoard2: SelPawn;
  let ownPawnOnNest: SelPawn;
  let otherPawnOnBoard: SelPawn;
  let ace: SelCard;
  let five: SelCard;
  let seven: SelCard;
  let jack: SelCard;
  let king: SelCard;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    ownPawnOnBoard = pawn('1', 1, 0);
    ownPawnOnBoard2 = pawn('1', 2, 0);
    ownPawnOnNest = pawn('1', 3, -1);
    otherPawnOnBoard = pawn('2', 1, 0);
    ace = card(1);
    five = card(5);
    seven = card(7);
    jack = card(11);
    king = card(13);
    sel.setPlayerId('1');
  });

  it('ownPawnThenEnemyPawn_WithJackInHand_AutoSelectsJackAndSwitch', () => {
    sel.setHand([jack, five]);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getCard()).toBe(jack);
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
    expect(sel.getPawn2()).toBe(otherPawnOnBoard);
    expect(sel.getMoveType()).toBe('switch');
  });

  it('ownPawnThenEnemyPawn_WithoutJackInHand_CannotSelectEnemy', () => {
    sel.setHand([five, seven]);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
  });

  it('jackAutoSelected_ClickEnemyAgain_DeselectsAndClearsCard', () => {
    sel.setHand([jack]);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getCard()).toBe(jack);
    sel.addPawn(otherPawnOnBoard);
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getCard()).toBeNull();
  });

  it('twoOwnPawns_WithSevenInHand_AutoSelectsSevenAndSplit', () => {
    sel.setHand([five, seven]);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getCard()).toBe(seven);
    expect(sel.getPawn1()).toBe(ownPawnOnBoard);
    expect(sel.getPawn2()).toBe(ownPawnOnBoard2);
    expect(sel.getMoveType()).toBe('split');
  });

  it('twoOwnPawns_WithoutSevenInHand_OnlyOnePawnSelected', () => {
    sel.setHand([five]);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawnId2()).toBeNull();
    expect(sel.getPawn1()).toBe(ownPawnOnBoard2);
  });

  it('nestPawn_WithKingInHand_AutoSelectsKingAndOnBoard', () => {
    sel.setHand([king, ace, five]);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getCard()).toBe(king);
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('nestPawn_WithoutKingButAceInHand_AutoSelectsAceAndOnBoard', () => {
    sel.setHand([ace, five]);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getCard()).toBe(ace);
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
    expect(sel.getMoveType()).toBe('onBoard');
  });

  it('nestPawn_WithoutKingOrAce_NoCardSelected', () => {
    sel.setHand([five, seven]);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getCard()).toBeNull();
    expect(sel.getPawn1()).toBe(ownPawnOnNest);
  });

  it('nestPawn_ClickAgain_DeselectsAndClearsAutoCard', () => {
    sel.setHand([king]);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getCard()).toBe(king);
    sel.addPawn(ownPawnOnNest);
    expect(sel.getPawnId1()).toBeNull();
    expect(sel.getCard()).toBeNull();
  });

  it('manualCardPick_IsNotOverriddenByAutoSelect', () => {
    // A manual pick stays put when a second OWN pawn is clicked (no auto-Seven override).
    // (Clicking an opponent's pawn is the deliberate exception — it infers a Jack switch.)
    sel.setHand([five, seven]);
    sel.setCard(five);
    sel.addPawn(ownPawnOnBoard);
    sel.addPawn(ownPawnOnBoard2);
    expect(sel.getCard()).toBe(five);
    expect(sel.getPawnId2()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionValidationTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - Validation', () => {
  let sel: PawnAndCardSelection;
  let p: SelPawn;

  beforeEach(() => {
    sel = new PawnAndCardSelection();
    p = pawn('2', 0, 5);
  });

  it('addPawnAndCard5_DeselectPawn_AddCard9_NrStepsUpdated', () => {
    sel.setPlayerId('2');
    sel.addPawn(p);
    sel.setCard(card(5));
    sel.addPawn(p); // deselect
    expect(sel.getPawn1()).toBeNull();
    expect(sel.getCard()?.value).toBe(5);

    sel.setCard(card(9));
    expect(sel.getCard()?.value).toBe(9);
    expect(sel.getNrStepsPawn1()).toBe(9);
  });

  it('addPawnAndCard_DeselectPawn_AddCard9_AddPawnAgain', () => {
    sel.setPlayerId('2');
    sel.addPawn(p);
    sel.setCard(card(1));
    sel.commitMove(); // GWT createMoveMessage()

    sel.setCard(card(9));
    sel.addPawn(p); // deselect
    sel.addPawn(p); // reselect
    expect(sel.getPawnId1()).toBe(p.id);
    expect(sel.getNrStepsPawn1()).toBe(9);
  });

  it('deselectingCard_ResetsNrSteps', () => {
    sel.setPlayerId('2');
    const normal = card(5);
    sel.setCard(normal);
    sel.setCard(normal); // deselect
    expect(sel.getNrStepsPawn1()).toBe(0);
  });

  it('deselectingKing_ResetsMoveType', () => {
    sel.setPlayerId('2');
    const king = card(13);
    sel.setCard(king);
    sel.setCard(king); // deselect
    expect(sel.getMoveType()).toBeNull();
  });

  it('updatePawnWithNewCurrentPosition', () => {
    const pawnOld = pawn('2', 0, -1);
    const pawnNew = pawn('2', 0, 5);
    sel.setPlayerId('2');
    sel.addPawn(pawnOld);
    sel.updatePawns([pawnNew]);
    expect(sel.getPawn1()?.tileNr).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PawnAndCardSelectionForfeitTest
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection - Forfeit', () => {
  it('ClickForfeit_OtherPlayerClicksPlay_DoesNotForfeitAsWell', () => {
    const sel = new PawnAndCardSelection();
    // player one forfeits, then "sends" (commit consumes the move type)
    sel.setMoveType('forfeit');
    sel.commitMove();
    // player two clicks send without selecting anything: no move type carried over
    const moveType = sel.commitMove();
    expect(moveType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Team play — controllable teammate pawns (step 4/5). Once all your own pawns are
// home the board marks your teammate controllable, so their pawns become selectable.
// ---------------------------------------------------------------------------
describe('PawnAndCardSelection — team play', () => {
  let sel: PawnAndCardSelection;
  beforeEach(() => {
    sel = new PawnAndCardSelection();
    sel.setPlayerId('1');
  });

  it('a teammate pawn cannot be selected until they are controllable', () => {
    sel.addPawn(pawn('2', 0, 5)); // not controllable yet
    expect(sel.getPawnId1()).toBeNull();
  });

  it('a controllable teammate pawn on the board is selectable as pawn1', () => {
    sel.setControllablePlayerIds(['1', '2']);
    const mate = pawn('2', 0, 5);
    sel.addPawn(mate);
    expect(sel.getPawnId1()).toBe(mate.id);
  });

  it('a controllable teammate pawn on the start tile is selectable', () => {
    sel.setControllablePlayerIds(['1', '2']);
    const mateOnStart = pawn('2', 0, 0); // start tile = 0
    sel.addPawn(mateOnStart);
    expect(sel.getPawnId1()).toBe(mateOnStart.id);
  });

  it('a controllable teammate pawn in the finish is selectable', () => {
    sel.setControllablePlayerIds(['1', '2']);
    const mateInFinish = pawn('2', 0, 16); // finish tiles are 16..19
    sel.addPawn(mateInFinish);
    expect(sel.getPawnId1()).toBe(mateInFinish.id);
  });

  it('a Jack switches a controllable teammate pawn (pawn1) with an opponent (pawn2)', () => {
    sel.setControllablePlayerIds(['1', '2']); // team {1,2}; player 3 is an opponent
    sel.setCard(card(11)); // Jack
    const mateOnStart = pawn('2', 0, 0);
    const opponentOnBoard = pawn('3', 0, 5);
    sel.addPawn(mateOnStart);
    sel.addPawn(opponentOnBoard);
    expect(sel.getPawnId1()).toBe(mateOnStart.id);
    expect(sel.getPawnId2()).toBe(opponentOnBoard.id);
  });
});
