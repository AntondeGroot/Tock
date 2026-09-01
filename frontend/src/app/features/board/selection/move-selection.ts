import { computed, signal } from '@angular/core';
import { Card as CardModel, MoveRequest, MovesService } from '../../../api';
import { GameSessionRef } from '../../../session';
import { MovePreview } from './move-preview';
import { PawnAndCardSelection, SelCard, SelPawn } from './pawn-and-card-selection';
import { buildMoveRequest, PawnLookup } from './move-request';

/** What one server push says about the choices open to the viewer. */
export interface SelectableState {
  viewerId: string | null;
  /** Whose pawns the viewer may move: their own, plus their teammate's in team play phase-2. */
  controllablePlayerIds: string[];
  pawns: SelPawn[];
  /** The hand as rendered — what a click can pick up. */
  hand: CardModel[];
  /** Cards already flown to the pile. They linger in a push for a beat and must not be selected. */
  pileUuids: Set<number>;
  /** The push's game version. A new one means the board moved, so any preview is out of date. */
  version: number | undefined;
}

/**
 * The viewer's move-in-progress: the card and pawn(s) picked, the 7-split allocation, and the
 * server's preview of where that move would land.
 *
 * It wraps the ported {@link PawnAndCardSelection}, which is a plain mutable object rather than a
 * signal. Every mutation therefore bumps a revision signal that the selectors below read, so the
 * component and its template only ever see signals — that bookkeeping lives here and nowhere else.
 */
export class MoveSelection {
  private readonly selection = new PawnAndCardSelection();
  /** Bumped after every mutation; the selectors read it so they recompute. */
  private readonly revision = signal(0);
  private readonly preview: MovePreview;
  /** The hand as last rendered, so a click can be resolved to the card it picked up. */
  private hand: CardModel[] = [];
  /** The game version the current preview was computed against. */
  private previewedVersion: number | undefined;

  constructor(
    moves: MovesService,
    session: GameSessionRef,
    private readonly findPawn: PawnLookup,
  ) {
    this.preview = new MovePreview(
      moves,
      session,
      this.selection,
      (type) => this.moveRequest(type),
      () => this.changed(),
    );
  }

  /**
   * Feed the state machine what the latest push allows; call on every push.
   *
   * A new game version means the board itself moved — an opponent's play may have switched the
   * selected pawn elsewhere or sent it home — which invalidates any preview computed against the
   * old positions. The selection survives that (its pawns are updated in place), so the preview is
   * recomputed rather than dropped. Re-runs of the same version cost nothing: the tiles still
   * describe the board as it stands.
   */
  sync(state: SelectableState): void {
    const boardMoved = state.version !== this.previewedVersion;
    this.previewedVersion = state.version;

    if (state.viewerId) this.selection.setPlayerId(state.viewerId);
    this.selection.setControllablePlayerIds(state.controllablePlayerIds);
    this.selection.updatePawns(state.pawns);
    this.hand = state.hand;
    this.selection.setHand(
      state.hand
        .filter((c) => !state.pileUuids.has(c.uuid))
        .map((c) => ({ id: c.uuid, value: c.value })),
    );
    this.changed();
    if (boardMoved) this.preview.refresh();
  }

  // ── What the view reads ────────────────────────────────────────────────────

  readonly card = computed<SelCard | null>(() => (this.revision(), this.selection.getCard()));
  readonly pawn1 = computed<SelPawn | null>(() => (this.revision(), this.selection.getPawn1()));
  readonly cardUuid = computed(() => this.card()?.id);
  /** The selected card's value, for the hint the board shows about it. */
  readonly cardValue = computed(() => this.card()?.value ?? null);
  readonly pawn1Id = computed(() => (this.revision(), this.selection.getPawnId1()));
  readonly pawn2Id = computed(() => (this.revision(), this.selection.getPawnId2()));
  readonly splitVisible = computed(() => (this.revision(), this.selection.isSplitBoxesVisible()));
  readonly stepsPawn1 = computed(() => (this.revision(), this.selection.getNrStepsPawn1()));
  readonly stepsPawn2 = computed(() => (this.revision(), this.selection.getNrStepsPawn2()));
  /** A card and a pawn: enough of a move to send. */
  readonly isComplete = computed(() => this.card() != null && this.pawn1() != null);

  /**
   * The previewed landing tiles, as "playerId:tileNr" keys. A method rather than a field, because
   * `preview` is built in the constructor and a field initializer would read it too early.
   */
  previewTiles(): Set<string> {
    return this.preview.tiles();
  }

  /** Whether the previewed move would land on this tile. */
  isPreview(playerId: string, tileNr: number): boolean {
    return this.preview.has(playerId, tileNr);
  }

  // ── What the view does ─────────────────────────────────────────────────────

  selectCard(uuid: number): void {
    const handCard = this.hand.find((c) => c.uuid === uuid);
    if (!handCard) return;
    this.selection.setCard({ id: handCard.uuid, value: handCard.value });
    this.changed();
    this.preview.refresh();
  }

  selectPawn(id: string): void {
    this.selection.addPawnById(id);
    this.changed();
    this.preview.refresh();
  }

  /** The 7-split step inputs. setNr…ForSplit wraps 8→0 and −1→7, like the GWT. */
  setStepsPawn1(value: string): void {
    this.selection.setNrStepsPawn1ForSplit(value);
    this.changed();
    this.preview.refresh();
  }

  setStepsPawn2(value: string): void {
    this.selection.setNrStepsPawn2ForSplit(value);
    this.changed();
    this.preview.refresh();
  }

  // ── What playing the turn needs ────────────────────────────────────────────

  /** The current selection as a move request — see move-request.ts. */
  moveRequest(type: MoveRequest['tempMessageType']): MoveRequest | undefined {
    return buildMoveRequest(this.selection, this.selection.getPlayerId(), this.findPawn, type);
  }

  /** Drop the selection — the move was accepted, or the turn was forfeited. */
  reset(): void {
    this.selection.reset();
    this.changed();
  }

  /** Stop previewing: the move is on its way to the server, or was given up on. */
  clearPreview(): void {
    this.preview.clear();
  }

  private changed(): void {
    this.revision.update((v) => v + 1);
  }
}
