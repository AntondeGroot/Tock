import { Component, signal, inject, computed, effect, OnInit, OnDestroy } from '@angular/core';
import {
  GameStatePush,
  MovesService,
  CardsService,
  Card as CardModel,
  MoveRequest,
  MoveResponse,
  TradeAction,
  TradeService,
} from '../../api';
import { buildBoard } from './geometry/board-geometry';
import { resolveGameSession } from '../../session';
import { basePath } from '../../base-path';
import { SoundService } from '../../sound.service';
import { Pawn } from './pawn/pawn';
import { CardLayer } from '../../card-table/card-layer';
import { CardTable } from '../../card-table/card-table';
import { DefaultCardPositioner } from '../../card-table/default-positioner';
import { PlayerList } from '../player-list/player-list';
import { TradePanel } from './trade/trade-panel/trade-panel';
import { highlightForPawn1, highlightForPawn2, stepBoxColor } from './pawn/pawn-highlight';
import { BoardCardFly } from './cards/board-card-fly';
import { projectCardBacks, projectPawns, projectTiles } from './board-view';
import { TeamTradeController } from './trade/team-trade-controller';
import { GameStateStream } from './game-state-stream';
import { PawnAnimator } from './pawn/pawn-animator';
import { SplitSteps } from './selection/split-steps/split-steps';
import { moveAnimation } from './pawn/move-animation';
import { postTradeAction } from './trade/trade-actions';
import { MoveSelection } from './selection/move-selection';
import { teammateCaptureTiles } from './selection/teammate-capture';
import { pawnKey } from './pawn/pawn-key';
import { hintKeyFor, isSpecialCard } from './cards/special-cards';
import { Translations } from '../../i18n/translations.service';
import { GameStore } from '../../game-store';
import { MoveRejection } from './feedback/move-rejected/move-rejection.service';
import { TeamHandoff } from '../team-handoff/team-handoff.service';
import { localRejectionKey, rejectionMessageKey } from './feedback/rejection-message';
import { allPawnsHome, teammateOf } from './selection/team-control';
import { TransitionSounds } from './feedback/transition-sounds';
import { RoundCardsAnimator } from './cards/round-cards-animator';

@Component({
  selector: 'app-board',
  imports: [Pawn, CardLayer, PlayerList, TradePanel, SplitSteps],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board implements OnInit, OnDestroy {
  private stream?: GameStateStream;

  ngOnInit(): void {
    if (!this.sessionId) return;
    this.stream = new GameStateStream(
      this.streamUrl,
      (push) => this.handleGameState(push),
      // Each (re)connect gets a fresh baseline snapshot — clear the animation baselines so it
      // isn't mistaken for a new move/deal, and drop the locally-accumulated discard pile: after a
      // drop it's stale, and the fresh snapshot is authoritative, so the reconnect starts clean.
      () => {
        this.prevMoveKey = undefined;
        this.roundCards.reset();
        this.cardTable.clearPile();
      },
    );
    this.stream.start();
    this.phoneLayout.addEventListener('change', this.onLayoutChange);
  }

  ngOnDestroy(): void {
    this.stream?.stop();
    this.phoneLayout.removeEventListener('change', this.onLayoutChange);
  }

  private handleGameState(next: GameStatePush): void {
    // Animate the pawns of the last move. Detect a NEW move (its paths changed)
    // and set it up BEFORE state.set, so pawns hold their start tiles instead of
    // snapping to the server's already-final positions. Skipped on the first push.
    const mr = next.lastMoveResponse;
    const moveKey = mr
      ? JSON.stringify([
          mr.movePawn1,
          mr.movePawn2,
          mr.movePawnKilledByPawn1,
          mr.movePawnKilledByPawn2,
        ])
      : '';
    if (this.prevMoveKey !== undefined && moveKey && moveKey !== this.prevMoveKey) {
      this.animateMove(mr!);
    }
    this.prevMoveKey = moveKey;

    // Hand the card fields to the animator: it deals in anything new and decides what may be
    // rendered yet — a fresh round waits for the last play/forfeit to finish first.
    this.roundCards.accept(next.playerCards ?? [], next.nrOfCardsPerPlayer ?? {});
    this.gameStore.players.set(next.players ?? []);
    this.gameStore.winners.set(next.winners ?? []);
    this.state.set(next);
    // Last: the fanfare for a player who just finished is delayed by the pawn animation queued
    // above, so this has to run after animateMove — an ordering an effect would leave implicit.
    this.transitionSounds.react(next);
  }
  private readonly movesService = inject(MovesService);
  private readonly cardsService = inject(CardsService);
  private readonly tradeService = inject(TradeService);
  protected readonly i18n = inject(Translations);
  private readonly rejection = inject(MoveRejection);
  private readonly teamHandoff = inject(TeamHandoff);
  private readonly sound = inject(SoundService);
  private readonly gameStore = inject(GameStore);
  private readonly session = resolveGameSession();
  protected readonly sessionId = this.session.sessionId;
  protected readonly viewerId = this.session.playerId;
  private readonly streamUrl = `${basePath()}/gamestates/${this.sessionId}/${this.viewerId}/stream`;
  protected readonly state = signal<GameStatePush | undefined>(undefined);
  protected readonly geometry = computed(() => {
    const s = this.state();
    const viewer = this.viewerId;
    if (!s?.players || !viewer) return undefined;
    return buildBoard(
      s.players.map((p) => ({ id: p.id, playerInt: p.playerInt! })),
      viewer,
    );
  });
  protected readonly tiles = computed(() => {
    const g = this.geometry();
    const s = this.state();
    return g && s?.players ? projectTiles(g, s.players) : [];
  });
  protected readonly pawns = computed(() => {
    const g = this.geometry();
    const s = this.state();
    return g && s?.pawns
      ? projectPawns(g, s.pawns, s.players ?? [], this.pawnAnimator.positions())
      : [];
  });
  protected readonly cell = computed(() => this.geometry()?.cellDistance ?? 0);

  // Face-down card backs for every OTHER player, fanned by their public card count.
  protected readonly cardBacks = computed(() => {
    const g = this.geometry();
    return g
      ? projectCardBacks(
          g,
          this.roundCards.counts(),
          this.viewerId,
          this.cardTable.dealing(),
          this.cardTable.stacked(),
        )
      : [];
  });

  // The reusable card table: owns the pile, the flyer layer and the deal-in FLIP, and computes
  // each card's on-table position (hand fan / pile / deck). Keezen uses the default layout; the
  // board drives it (dealIn / flyToPile / clearPile) from its GameStatePush diffing below.
  // Pawn move animation: a small engine that walks pawns along pixel waypoints and exposes their
  // live positions; the `pawns` computed reads those to place a pawn mid-move (see below).
  private readonly pawnAnimator = new PawnAnimator();
  private readonly positioner = new DefaultCardPositioner();
  // Explicitly typed: the hand it reads now comes from roundCards, which takes the table back
  // as a constructor argument — without the annotation that cycle infers as `any`.
  protected readonly cardTable: CardTable = new CardTable(() => this.hand(), this.positioner);
  // Owns the hand and counts the board renders: it diffs each push into deal-in animations and
  // holds a new round back until the play or forfeit that ended the previous one has settled.
  private readonly roundCards = new RoundCardsAnimator(this.cardTable, this.pawnAnimator);
  /** The hand as SHOWN — the animator's, which holds a new round back until the table settles. */
  protected readonly hand = this.roundCards.hand;
  // Bridges Keezen board geometry to the card-table for opponents' plays/forfeits and team trades.
  private readonly cardFly = new BoardCardFly(
    () => this.geometry(),
    () => this.hand(),
    this.cardTable,
    this.positioner,
    this.viewerId,
  );
  // Which card values get the gold "special" highlight (Ace/Four/Seven/Jack/Queen/King).
  protected readonly isSpecial = isSpecialCard;

  // Turn-change / medal sounds: fed every push from handleGameState, fires on the transition.
  private readonly transitionSounds = new TransitionSounds(this.sound, this.pawnAnimator);

  // The phone layout, matching the 699px breakpoint the SCSS uses. The 7-split control needs a
  // different PARENT on each layout — the button column on a desktop, a band under the hand on a
  // phone — and no stylesheet can move a node between parents, so the template branches on this.
  private readonly phoneLayout = window.matchMedia('(max-width: 699px)');
  protected readonly isPhone = signal(this.phoneLayout.matches);
  private readonly onLayoutChange = (e: MediaQueryListEvent) => this.isPhone.set(e.matches);
  private prevMoveKey: string | undefined;

  // The move being composed: card, pawn(s), the 7-split and the server-side landing preview.
  // See selection/move-selection.ts — the template drives it directly.
  protected readonly selection = new MoveSelection(this.movesService, this.session, (id) =>
    this.findPawn(id),
  );

  constructor() {
    // Reactions to each server push. Each effect dynamically tracks whatever signals its
    // method reads, so the split is purely for readability.
    effect(() => this.syncSelection());
    effect(() =>
      this.cardFly.reactToCounts(this.roundCards.counts(), this.state()?.playedCards ?? []),
    );
    effect(() => this.announceTeamHandoff());
    effect(() => this.teamTrade.reactToOutcome());
  }

  /**
   * Feed the selection state machine the current player, pawns (with live positions) and hand
   * from every server push, so it can validate moves and auto-select cards.
   */
  private syncSelection(): void {
    const s = this.state();
    this.selection.sync({
      viewerId: this.viewerId,
      // In team play you may also move your teammate's pawns once all your own are home.
      controllablePlayerIds: this.controllablePlayerIds(),
      pawns: (s?.pawns ?? []).map((p) => ({
        id: pawnKey(p.pawnId),
        playerId: p.pawnId.playerId,
        tileNr: p.currentTileId.tileNr,
      })),
      hand: this.hand(),
      version: s?.version,
      // A played card can linger in the server's hand for a beat after flying to the pile; the
      // display hand does the same, so it can never be (auto-)selected.
      pileUuids: new Set(this.cardTable.pile().map((c) => c.uuid)),
    });
  }

  /**
   * Announce the hand-off once: the moment your own pawns are all home in a team game, you may
   * start playing your teammate's pawns. Fires on the transition.
   */
  private announceTeamHandoff(): void {
    const mayPlay = this.mayPlayTeammatePawns();
    if (mayPlay && !this.prevMayPlayTeammatePawns) {
      this.teamHandoff.show(this.i18n.t('teamHandoffTitle'), this.i18n.t('teamHandoffMessage'));
    }
    this.prevMayPlayTeammatePawns = mayPlay;
  }

  private prevMayPlayTeammatePawns = false;

  // ── Team card trade (step 5) — its own controller (state, view state, outcome reaction). ──
  protected readonly teamTrade = new TeamTradeController(
    () => this.state(),
    () => this.hand(),
    this.viewerId,
    (otherId, received, given) => this.cardFly.tradeSwap(otherId, received, given),
    // The ask goes out the moment the button is pressed; the picker then opens off the pending
    // trade that comes back over SSE.
    () =>
      postTradeAction(
        this.tradeService,
        this.sessionId,
        this.viewerId,
        TradeAction.ActionEnum.Request,
      ),
    (title, message) => this.teamHandoff.show(title, message),
    (key, ...args) => this.i18n.t(key, ...args),
  );

  // The players whose pawns the viewer may move: themselves, plus their teammate once all the
  // viewer's own pawns are home (team play phase-2). Fed to the selection so a teammate's pawns
  // become selectable — the backend enforces the same rule.
  private readonly controllablePlayerIds = computed(() => {
    const me = this.viewerId;
    if (!me) return [];
    const mate = this.teammate();
    return this.mayPlayTeammatePawns() && mate ? [me, mate.id] : [me];
  });

  private readonly teammate = computed(() => teammateOf(this.state()?.players, this.viewerId));

  /**
   * Team play: may the viewer play their teammate's pawns? Only once all of the viewer's own pawns
   * are home AND the teammate still has a pawn to move — see team-control.ts. Drives both the
   * hand-off announcement and the selection, so neither fires when the team has just finished.
   */
  private readonly mayPlayTeammatePawns = computed(() => {
    const mate = this.teammate();
    const pawns = this.state()?.pawns;
    return !!mate && allPawnsHome(pawns, this.viewerId) && !allPawnsHome(pawns, mate.id);
  });

  // --- Pawn move animation (drives the reusable PawnAnimator engine) -------

  /**
   * Queue a move's pawns as ONE group, so they move together. The animator plays queued groups
   * strictly in order — this move waits for any still-running one instead of cutting it short —
   * so the sounds are offset by that wait too.
   */
  private animateMove(mr: MoveResponse): void {
    const g = this.geometry();
    if (!g) return;
    const { walks, killDelay1, killDelay2 } = moveAnimation(g, mr);
    const wait = this.pawnAnimator.enqueue(walks);
    if (mr.moveType === 'onBoard') this.sound.play('pawnOnBoard', wait);
    // A captured pawn "dies" as it's flung home — play the kill sound as that begins.
    if (mr.pawnKilledByPawn1) this.sound.play('pawnKilled', wait + killDelay1);
    if (mr.pawnKilledByPawn2) this.sound.play('pawnKilled', wait + killDelay2);
  }

  private findPawn(id: string) {
    return this.state()?.pawns?.find((p) => pawnKey(p.pawnId) === id);
  }

  /** Both action buttons are dead outside your own turn — the server refuses those moves anyway. */
  protected readonly isMyTurn = computed(
    () => this.viewerId != null && this.state()?.currentPlayerId === this.viewerId,
  );

  protected readonly canPlay = computed(() => this.isMyTurn() && this.selection.isComplete());

  // The backend allows a forfeit only when the player has no legal move; when they
  // do have one they must play it, so the Forfeit button is disabled. Defaults to
  // enabled until a state with the flag arrives (don't lock the player out).
  //
  // Held shut while a new ROUND is still dealing in. The server computes `canForfeit`
  // from the COMPLETE new hand and pushes it before the first card has landed, so an
  // enabled Forfeit button would announce "nothing you're about to be dealt is
  // playable" while the cards are still flying in — the reveal is the suspense.
  // A team trade also flies a card into the hand, but that one you asked for and already know
  // about — nothing to spoil there, so only a round deal holds the button shut.
  protected readonly canForfeit = computed(
    () =>
      this.isMyTurn() && !this.roundCards.dealingNewRound() && (this.state()?.canForfeit ?? true),
  );

  /** The card value currently hovered in the hand (drives the hint), or null. */
  private readonly hoveredCardValue = signal<number | null>(null);
  protected hoverCard(value: number | null): void {
    this.hoveredCardValue.set(value);
  }

  /**
   * Hint/suggestion for the special card the player is eyeing: the hovered card,
   * falling back to the selected card when nothing is hovered. Empty for a regular
   * card — only Ace/Four/Seven/Jack/Queen/King have a hint (mirrors the GWT
   * updateCardHint).
   */
  protected readonly hint = computed(() => {
    const key = hintKeyFor(this.hoveredCardValue() ?? this.selection.cardValue());
    return key ? this.i18n.t(key) : '';
  });

  protected isPreview(playerId: string, tileNr: number): boolean {
    return this.selection.isPreview(playerId, tileNr);
  }

  // Of those, the ones that would land on a teammate's pawn (team play only) — the board warns on
  // these in red instead of the usual gold.
  protected readonly teammateCaptureTiles = computed(() =>
    teammateCaptureTiles(
      this.selection.previewTiles(),
      this.state()?.pawns ?? [],
      this.state()?.players ?? [],
      this.viewerId,
    ),
  );
  protected isTeammateCapture(playerId: string, tileNr: number): boolean {
    return this.teammateCaptureTiles().has(`${playerId}:${tileNr}`);
  }

  // Step-box label + input-border colours match each pawn's board highlight colour
  // (which depends on the pawn's own colour), like the GWT updateStepBoxColors.
  protected readonly pawn1Highlight = computed(() =>
    stepBoxColor(this.selection.pawn1Id(), this.state()?.players ?? [], 1),
  );
  protected readonly pawn2Highlight = computed(() =>
    stepBoxColor(this.selection.pawn2Id(), this.state()?.players ?? [], 2),
  );

  protected readonly highlightForPawn1 = highlightForPawn1;
  protected readonly highlightForPawn2 = highlightForPawn2;

  // Submit the current selection (the green "play card" button). The server
  // re-derives the move type from the card + pawns, so we just send the pieces.
  protected playCard(): void {
    const card = this.selection.card();
    const pawn1 = this.selection.pawn1();
    if (!card || !pawn1 || !this.sessionId || !this.viewerId) return;
    this.sound.play('buttonClick');

    // Explain selections the server would reject with a bare 400 (no reason),
    // instead of misreporting them as "not your turn".
    const localKey = localRejectionKey(pawn1.tileNr, card.value);
    if (localKey) {
      this.rejection.show(this.i18n.t(localKey));
      return;
    }

    const move = this.selection.moveRequest('MAKE_MOVE');
    if (!move) return;
    const handCard = this.hand().find((c) => c.uuid === card.id);
    this.send(handCard, move);
  }

  private send(card: CardModel | undefined, move: MoveRequest): void {
    if (!this.sessionId || !this.viewerId) return;
    this.selection.clearPreview(); // stop the move preview while submitting
    const from = this.cardFly.handSlotOf(card); // the hand slot the card flies from, if accepted
    this.movesService.makeMove(this.sessionId, this.viewerId, move).subscribe({
      next: (response) => {
        if (response.result === 'CAN_MAKE_MOVE') {
          this.selection.reset(); // accepted → clear the selection
          this.cardFly.ownPlay(from, card);
        } else {
          // Rejected by the rules (still a 200): explain why, and keep the
          // selection so the player can adjust it.
          this.rejection.show(
            this.i18n.t(
              rejectionMessageKey(response.rejectionReason),
              response.rejectionDetail ?? '',
            ),
          );
        }
      },
      error: () => {
        // 400 — typically not your turn (or a stale double-submit).
        this.rejection.show(this.i18n.t('moveRejectedNotYourTurn'));
      },
    });
  }

  // Forfeit the turn (the amber forfeit button) — DELETE /cards/{session}/{player}.
  protected forfeit(): void {
    if (!this.sessionId || !this.viewerId) return;
    this.sound.play('buttonClick');
    this.cardsService.playerForfeits(this.sessionId, this.viewerId).subscribe({
      error: () => {
        /* fire-and-forget: errors are non-critical here */
      },
    });
    this.selection.reset();
    this.selection.clearPreview();
    this.cardFly.ownForfeit(); // the hand empties onto the pile, one card at a time
  }
}
