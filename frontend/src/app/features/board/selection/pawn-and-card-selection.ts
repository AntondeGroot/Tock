/**
 * Faithful TypeScript port of the GWT `PawnAndCardSelection`. Pure logic — no DOM,
 * no Angular — so it can be unit-tested exactly like the original Java class.
 *
 * It tracks the pawn(s) + card the player has selected, infers/validates the move
 * type and step counts, and auto-selects a card when the pawn choice makes it
 * unambiguous. The only UI coupling in the GWT version (showing/hiding the 7-split
 * step boxes) becomes the `splitBoxesVisible` flag for the component to read.
 *
 * Tile numbers: < 0 = nest, 0..15 = normal board, >= 16 = finish.
 */

export type SelMoveType = 'move' | 'onBoard' | 'switch' | 'split' | 'forfeit';

/** Minimal pawn shape the selection needs (adapt the API Pawn into this). */
export interface SelPawn {
  id: string; // unique identity, e.g. "p0:1"
  playerId: string; // owner
  tileNr: number;
}

/** Minimal card shape (adapt the API Card into this). */
export interface SelCard {
  id: number; // unique id (uuid)
  value: number; // 1..13
}

const isNest = (p: SelPawn | null): boolean => p != null && p.tileNr < 0;
const isFinish = (p: SelPawn | null): boolean => p != null && p.tileNr >= 16;
const isNormalBoard = (p: SelPawn | null): boolean => p != null && !isNest(p) && !isFinish(p);
const samePawn = (a: SelPawn | null, b: SelPawn | null): boolean =>
  (a === null && b === null) || (a != null && b != null && a.id === b.id);
const sameCard = (a: SelCard | null, b: SelCard | null): boolean =>
  a != null && b != null && a.id === b.id;

export class PawnAndCardSelection {
  private playerId: string | null = null;
  // Player ids whose pawns the viewer may move as pawn1 — normally just themselves, plus their
  // teammate once all their own pawns are home (team play). Empty → falls back to self only.
  private controllable = new Set<string>();
  private pawns: SelPawn[] = [];
  private hand: SelCard[] = [];

  private pawn1: SelPawn | null = null;
  private pawn2: SelPawn | null = null;
  private card: SelCard | null = null;
  private moveType: SelMoveType | null = null;
  private nrStepsPawn1 = 0;
  private nrStepsPawn2 = 0;
  private drawCards = true;
  private cardWasAutoSelected = false;
  private splitDefaultPending = false;
  private splitBoxesVisible = false;

  setPlayerId(id: string): void {
    // Changing player deselects everything (mirrors the Java comment/behaviour).
    if (this.playerId !== id) {
      this.reset();
    }
    this.playerId = id;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  /** The players whose pawns can be moved as pawn1 (yourself + your teammate in team phase-2). */
  setControllablePlayerIds(ids: string[]): void {
    this.controllable = new Set(ids);
  }

  /** Whether the viewer may control this pawn as pawn1 (self, or a teammate in phase-2). */
  private isControllable(pawn: SelPawn | null): boolean {
    if (pawn == null) return false;
    return this.controllable.size > 0
      ? this.controllable.has(pawn.playerId)
      : pawn.playerId === this.playerId;
  }

  updatePawns(pawns: SelPawn[]): void {
    this.pawns = [...pawns];
    this.checkIfSelectedPawnsAreUpToDate();
  }

  /** Keep the player's hand so a card can be auto-selected (see autoSelectCardFor). */
  setHand(hand: SelCard[] | null): void {
    this.hand = hand == null ? [] : [...hand];
  }

  private checkIfSelectedPawnsAreUpToDate(): void {
    for (const pawn of this.pawns) {
      if (samePawn(pawn, this.pawn1)) this.pawn1 = pawn;
      if (samePawn(pawn, this.pawn2)) this.pawn2 = pawn;
    }
  }

  private getPawn(pawnId: string): SelPawn | null {
    return this.pawns.find((p) => p.id === pawnId) ?? null;
  }

  /** Select a pawn by id (real-life onClick path — uses the current pawn positions). */
  addPawnById(pawnId: string): void {
    const pawn = this.getPawn(pawnId);
    if (pawn == null) return;
    this.addPawn(pawn);
  }

  /** Select a pawn directly (used by tests). */
  addPawn(pawn: SelPawn): void {
    this.validateHowManyPawnsCanBeSelected(pawn);
    this.validateSelectionBasedOnLocation();
    this.validateMoveType();
    this.clearAutoCardIfIncomplete();
  }

  private validateSelectionBasedOnLocation(): void {
    if (this.card == null) return;
    switch (this.card.value) {
      case 1:
        break; // always valid: nest / board / finish
      case 11:
        this.secondPawnIsOnNormalBoardWhenYouPlayJack();
        break;
      case 13:
        this.firstPawnIsOnNestWhenYouPlayKing();
        break;
      default:
        break;
    }
  }

  private secondPawnIsOnNormalBoardWhenYouPlayJack(): void {
    // A Jack switches your pawn with ANOTHER player's pawn on the normal board.
    // Drop pawn2 if it is off the normal board, or if it is one of your own
    // (you cannot switch two of your own pawns — the Seven->Jack bugfix test).
    if (this.pawn2 != null && (!isNormalBoard(this.pawn2) || this.isControllable(this.pawn2))) {
      this.pawn2 = null;
    }
  }

  private firstPawnIsOnNestWhenYouPlayKing(): void {
    if (this.pawn2 != null) this.pawn2 = null;
  }

  private aPawnWasNotDeselected(pawn: SelPawn): boolean {
    if (samePawn(this.pawn1, pawn)) {
      // re-clicking pawn1 deselects it; pawn2 (if any) becomes pawn1
      this.pawn1 = this.pawn2;
      this.pawn2 = null;
      return false;
    }
    if (samePawn(this.pawn2, pawn)) {
      this.pawn2 = null;
      return false;
    }
    return true;
  }

  private handlePlayerCanSelect2Pawns(pawn: SelPawn): void {
    if (this.aPawnWasNotDeselected(pawn)) {
      if (!this.isControllable(pawn)) return;
      if (this.pawn1 == null) this.pawn1 = pawn;
      else this.pawn2 = pawn;
    }
  }

  private handlePlayerCanSelect1Pawn(pawn: SelPawn): void {
    if (this.aPawnWasNotDeselected(pawn)) {
      if (this.isControllable(pawn)) this.pawn1 = pawn;
    }
  }

  private handlePlayerCanSelectTheirOwnAndOpponentsPawn(pawn: SelPawn): void {
    if (this.aPawnWasNotDeselected(pawn)) {
      if (this.isControllable(pawn)) this.pawn1 = pawn;
      else this.pawn2 = pawn;
    }
  }

  private validateHowManyPawnsCanBeSelected(pawn: SelPawn): void {
    // An auto-selected card is tied to the pawns that justified it: re-derive from
    // scratch every click so it never lingers after the selection changes.
    if (this.cardWasAutoSelected) {
      this.card = null;
      this.cardWasAutoSelected = false;
      if (!samePawn(pawn, this.pawn1) && !samePawn(pawn, this.pawn2)) {
        this.pawn2 = null;
      }
    }

    // An opponent's pawn is only ever the target of a Jack switch. If the player clicks one while
    // an own pawn is selected under a non-Jack card (e.g. a plain number picked for their own move),
    // read it as switch intent: swap in a Jack from hand so the Jack + opponent pawn get selected.
    if (
      this.pawn1 != null &&
      !this.isControllable(pawn) &&
      !samePawn(pawn, this.pawn2) &&
      (this.card == null || this.card.value !== 11)
    ) {
      const jack = this.hand.find((c) => c.value === 11) ?? null;
      if (jack != null) {
        this.card = jack;
        this.cardWasAutoSelected = true;
      }
    }

    if (this.card == null) this.autoSelectCardFor(pawn);

    if (this.card == null) {
      this.handlePlayerCanSelect1Pawn(pawn);
      return;
    }

    switch (this.card.value) {
      case 7:
        this.handlePlayerCanSelect2Pawns(pawn);
        break;
      case 11:
        this.handlePlayerCanSelectTheirOwnAndOpponentsPawn(pawn);
        break;
      default:
        this.handlePlayerCanSelect1Pawn(pawn);
        break;
    }
  }

  /**
   * With no card selected, infer the intended card from the clicked pawn and
   * auto-select it from hand (when held):
   *  - clicking a second own pawn          -> Seven (split)
   *  - clicking an opponent's pawn          -> Jack (switch)
   *  - clicking an own pawn still in nest   -> King, else Ace
   */
  private autoSelectCardFor(pawn: SelPawn): void {
    if (this.playerId == null) return;
    const isOwnPawn = this.isControllable(pawn);

    if (this.pawn1 != null && !samePawn(this.pawn1, pawn)) {
      if (isOwnPawn) this.autoSelectCardWithValue(7);
      else this.autoSelectCardWithValue(11);
      return;
    }

    if (this.pawn1 == null && isOwnPawn && isNest(pawn)) {
      if (!this.autoSelectCardWithValue(13)) this.autoSelectCardWithValue(1);
    }
  }

  /** Select the first card in hand with the given value; returns whether one was found. */
  private autoSelectCardWithValue(value: number): boolean {
    const found = this.hand.find((c) => c.value === value);
    if (found) {
      this.card = found;
      this.cardWasAutoSelected = true;
      return true;
    }
    return false;
  }

  /** Drop an auto-selected card if the selection that justified it is incomplete. */
  private clearAutoCardIfIncomplete(): void {
    if (!this.cardWasAutoSelected || this.card == null) return;
    let complete: boolean;
    switch (this.card.value) {
      case 7:
      case 11:
        complete = this.pawn1 != null && this.pawn2 != null; // need two pawns
        break;
      default:
        complete = this.pawn1 != null; // King / Ace need a pawn
        break;
    }
    if (!complete) {
      this.card = null;
      this.cardWasAutoSelected = false;
      this.moveType = null;
      this.nrStepsPawn1 = 0;
      this.nrStepsPawn2 = 0;
    }
  }

  setCard(card: SelCard): void {
    this.drawCards = true;
    this.cardWasAutoSelected = false; // a manual pick is authoritative

    // deselect when the same card is clicked twice
    if (this.card != null && sameCard(this.card, card)) {
      this.card = null;
      this.nrStepsPawn1 = 0;
      this.nrStepsPawn2 = 0;
      this.moveType = null;
      return;
    }

    this.card = card;
    this.validateSelectionBasedOnLocation();
    this.validateMoveType();
  }

  private validateMoveType(): void {
    if (this.card == null) return;
    this.splitBoxesVisible = false;

    switch (this.card.value) {
      case 1:
        this.handleAce();
        break;
      case 7:
        this.handleSeven();
        break;
      case 11:
        this.handleJack();
        break;
      case 13:
        this.handleKing();
        break;
      default:
        this.handleDefaultCard();
        break;
    }

    // selecting a card that is not 7 or Jack deselects the second pawn
    if (this.card.value !== 7 && this.card.value !== 11) {
      this.pawn2 = null;
    }
  }

  private handleAce(): void {
    if (this.pawn1 == null) {
      this.nrStepsPawn1 = 1;
      this.moveType = 'move';
      return;
    }
    if (this.pawn1.tileNr < 0) {
      this.nrStepsPawn1 = 0;
      this.moveType = 'onBoard';
    } else {
      this.nrStepsPawn1 = 1;
      this.moveType = 'move';
    }
  }

  private handleSeven(): void {
    if (this.pawn1 != null && this.pawn2 != null) {
      this.moveType = 'split';
      this.nrStepsPawn1 = 0;
      this.nrStepsPawn2 = 7;
      this.splitDefaultPending = true; // presenter adopts the recommended split
      this.splitBoxesVisible = true;
    } else {
      this.moveType = 'move';
      this.nrStepsPawn1 = 7;
      this.nrStepsPawn2 = 0;
    }
  }

  private handleJack(): void {
    this.nrStepsPawn1 = 0;
    this.nrStepsPawn2 = 0;
    this.moveType = 'switch';
  }

  private handleKing(): void {
    this.nrStepsPawn1 = 0;
    this.nrStepsPawn2 = 0;
    this.moveType = 'onBoard';
  }

  private handleDefaultCard(): void {
    if (this.card == null) return;
    this.moveType = 'move';
    this.nrStepsPawn1 = this.card.value;
    if (this.nrStepsPawn1 === 4) this.nrStepsPawn1 = -4; // a 4 moves backwards
  }

  setNrStepsPawn1ForSplit(input: string): void {
    let value = parseInt(input, 10);
    if (Number.isNaN(value)) value = this.nrStepsPawn1;
    if (value > 7) value = 0;
    else if (value < 0) value = 7;
    this.nrStepsPawn1 = value;
    this.nrStepsPawn2 = 7 - this.nrStepsPawn1;
  }

  setNrStepsPawn2ForSplit(input: string): void {
    let value = parseInt(input, 10);
    if (Number.isNaN(value)) value = this.nrStepsPawn2;
    if (value > 7) value = 0;
    else if (value < 0) value = 7;
    this.nrStepsPawn2 = value;
    this.nrStepsPawn1 = 7 - this.nrStepsPawn2;
  }

  reset(): void {
    // playerId is intentionally kept
    this.pawn1 = null;
    this.pawn2 = null;
    this.card = null;
    this.cardWasAutoSelected = false;
    this.splitDefaultPending = false;
    this.drawCards = true;
    this.moveType = null;
    this.nrStepsPawn1 = 0;
    this.nrStepsPawn2 = 0;
    this.splitBoxesVisible = false;
  }

  resetSuccessfulMove(): void {
    this.pawn2 = null;
    this.card = null;
    this.cardWasAutoSelected = false;
    this.splitDefaultPending = false;
    this.drawCards = true;
    this.moveType = null;
    this.nrStepsPawn1 = 0;
    this.nrStepsPawn2 = 0;
    this.splitBoxesVisible = false;
  }

  // ---- read-only state for the component ----
  getPawn1(): SelPawn | null {
    return this.pawn1;
  }
  getPawn2(): SelPawn | null {
    return this.pawn2;
  }
  getPawnId1(): string | null {
    return this.pawn1?.id ?? null;
  }
  getPawnId2(): string | null {
    return this.pawn2?.id ?? null;
  }
  getCard(): SelCard | null {
    return this.card;
  }
  getMoveType(): SelMoveType | null {
    return this.moveType;
  }
  setMoveType(moveType: SelMoveType | null): void {
    this.moveType = moveType;
    // Forfeiting is not a card play: clear the pawn/card selection so nothing
    // stale is carried into the move. (The GWT tests assert this; the literal
    // Java setter does not do it — see the note in the spec.)
    if (moveType === 'forfeit') {
      this.card = null;
      this.pawn1 = null;
      this.pawn2 = null;
      this.cardWasAutoSelected = false;
      this.nrStepsPawn1 = 0;
      this.nrStepsPawn2 = 0;
    }
  }

  /**
   * Consume the pending move type and clear it (the GWT `createMoveMessage`
   * side-effect). Returns the move type that was in effect; a second call returns
   * null, preventing an accidental double-play.
   */
  commitMove(): SelMoveType | null {
    const moveType = this.moveType;
    this.moveType = null;
    return moveType;
  }
  getNrStepsPawn1(): number {
    return this.nrStepsPawn1;
  }
  getNrStepsPawn2(): number {
    return this.nrStepsPawn2;
  }
  setNrStepsPawn1(steps: number): void {
    this.nrStepsPawn1 = steps;
  }
  setNrStepsPawn2(steps: number): void {
    this.nrStepsPawn2 = steps;
  }
  getDrawCards(): boolean {
    return this.drawCards;
  }
  setCardsAreDrawn(): void {
    this.drawCards = false;
  }
  isSplitBoxesVisible(): boolean {
    return this.splitBoxesVisible;
  }
  isSplitDefaultPending(): boolean {
    return this.splitDefaultPending;
  }
  clearSplitDefaultPending(): void {
    this.splitDefaultPending = false;
  }
}
