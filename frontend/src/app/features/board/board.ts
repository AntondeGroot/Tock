import { Component, signal, inject, computed, effect, OnInit, OnDestroy } from '@angular/core';
import {
  GameStatePush,
  MovesService,
  CardsService,
  Card as CardModel,
  MoveRequest,
  MoveResponse,
} from '../../api';
import { buildBoard } from './board-geometry';
import { resolveGameSession } from '../../session';
import { basePath } from '../../base-path';
import { SoundService } from '../../sound.service';
import { Pawn } from './pawn/pawn';
import { CardLayer } from '../../card-table/card-layer';
import { CardTable } from '../../card-table/card-table';
import { DefaultCardPositioner } from '../../card-table/default-positioner';
import { PlayerList } from '../player-list/player-list';
import { TradePanel } from './trade-panel/trade-panel';
import { highlightForPawn1, highlightForPawn2, stepBoxColor } from './pawn-highlight';
import { BoardCardFly } from './board-card-fly';
import { projectCardBacks, projectPawns, projectTiles } from './board-view';
import { TeamTradeController } from './team-trade-controller';
import { GameStateStream } from './game-state-stream';
import { PawnAnimator } from './pawn-animator';
import { SplitSteps } from './split-steps/split-steps';
import { moveAnimation } from './move-animation';
import { PawnAndCardSelection } from './pawn-and-card-selection';
import { teammateCaptureTiles } from './teammate-capture';
import { pawnKey } from './pawn-key';
import { hintKeyFor, isSpecialCard } from './special-cards';
import { Translations } from '../../i18n/translations.service';
import { GameStore } from '../../game-store';
import { MoveRejection } from './move-rejected/move-rejection.service';
import { TeamHandoff } from './team-handoff/team-handoff.service';
import { localRejectionKey, rejectionMessageKey } from './rejection-message';

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
        this.prevHandUuids = undefined;
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

    // Detect a deal (cards that weren't in the hand before) and start the
    // deal-in BEFORE setting state, so those cards render at the deck rather
    // than flashing at their slots first. The FIRST push after (re)connecting
    // has no baseline, so it isn't animated — a refresh mid-game just shows the
    // current hand; only a genuine new round during the session deals in.
    const cards = next.playerCards ?? [];
    const prev = this.prevHandUuids;
    if (prev) {
      // A new round deals a fresh batch, growing the hand. Card uuids are REUSED across rounds, so
      // the finished round's pile must be cleared here — otherwise a redealt card whose uuid still
      // lingers in the (never-otherwise-cleared) pile is filtered out of the hand and silently
      // vanishes. Gate on the hand actually growing so a net-neutral trade (1 out, 1 in) doesn't
      // wipe the current round's pile.
      if (cards.length > prev.size) this.cardTable.clearPile();
      const fresh = cards.filter((c) => !prev.has(c.uuid)).map((c) => c.uuid);
      if (fresh.length > 0) this.cardTable.dealIn(fresh);
    }
    this.prevHandUuids = new Set(cards.map((c) => c.uuid));
    this.gameStore.players.set(next.players ?? []);
    this.gameStore.winners.set(next.winners ?? []);
    this.state.set(next);
  }
  private readonly movesService = inject(MovesService);
  private readonly cardsService = inject(CardsService);
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
    const counts = this.state()?.nrOfCardsPerPlayer;
    return g && counts
      ? projectCardBacks(
          g,
          counts,
          this.viewerId,
          this.cardTable.dealing(),
          this.cardTable.stacked(),
        )
      : [];
  });

  protected readonly hand = computed(() => this.state()?.playerCards ?? []);

  // The reusable card table: owns the pile, the flyer layer and the deal-in FLIP, and computes
  // each card's on-table position (hand fan / pile / deck). Keezen uses the default layout; the
  // board drives it (dealIn / flyToPile / clearPile) from its GameStatePush diffing below.
  private readonly positioner = new DefaultCardPositioner();
  protected readonly cardTable = new CardTable(() => this.hand(), this.positioner);
  // Bridges Keezen board geometry to the card-table for opponents' plays/forfeits and team trades.
  private readonly cardFly = new BoardCardFly(
    () => this.geometry(),
    () => this.hand(),
    this.cardTable,
    this.positioner,
  );
  // Which card values get the gold "special" highlight (Ace/Four/Seven/Jack/Queen/King).
  protected readonly isSpecial = isSpecialCard;

  private prevCounts: Record<string, number> | undefined;
  private prevHandUuids: Set<number> | undefined;

  // Pawn move animation: a small engine that walks pawns along pixel waypoints and exposes their
  // live positions; the `pawns` computed reads those to place a pawn mid-move (see below).
  private readonly pawnAnimator = new PawnAnimator();

  // The phone layout, matching the 699px breakpoint the SCSS uses. The 7-split control needs a
  // different PARENT on each layout — the button column on a desktop, a band under the hand on a
  // phone — and no stylesheet can move a node between parents, so the template branches on this.
  private readonly phoneLayout = window.matchMedia('(max-width: 699px)');
  protected readonly isPhone = signal(this.phoneLayout.matches);
  private readonly onLayoutChange = (e: MediaQueryListEvent) => this.isPhone.set(e.matches);
  private prevMoveKey: string | undefined;

  // --- Selection: delegated to the ported PawnAndCardSelection state machine ---
  private readonly selection = new PawnAndCardSelection();
  // The selection is a plain mutable object, not a signal; bump `rev` after every
  // change so the computed selectors below recompute and the view updates.
  private readonly rev = signal(0);
  private touch(): void {
    this.rev.update((v) => v + 1);
  }

  constructor() {
    // Reactions to each server push. Each effect dynamically tracks whatever signals its
    // method reads, so the split is purely for readability.
    effect(() => this.syncSelection());
    effect(() => this.flyOpponentPlays());
    effect(() => this.announceTeamHandoff());
    effect(() => this.teamTrade.reactToOutcome());
    effect(() => this.playTransitionSounds());
  }

  /**
   * Feed the selection state machine the current player, pawns (with live positions) and hand
   * from every server push, so it can validate moves and auto-select cards.
   */
  private syncSelection(): void {
    const s = this.state();
    if (this.viewerId) this.selection.setPlayerId(this.viewerId);
    // In team play you may also move your teammate's pawns once all your own are home.
    this.selection.setControllablePlayerIds(this.controllablePlayerIds());
    this.selection.updatePawns(
      (s?.pawns ?? []).map((p) => ({
        id: pawnKey(p.pawnId),
        playerId: p.pawnId.playerId,
        tileNr: p.currentTileId.tileNr,
      })),
    );
    // Exclude cards already on the pile so a played card can never be (auto-)selected —
    // the display hand does the same (see `handCards`). Guards against a played card
    // lingering in the server's playerCards for a beat after it flew to the pile.
    const pileUuids = new Set(this.cardTable.pile().map((c) => c.uuid));
    this.selection.setHand(
      (s?.playerCards ?? [])
        .filter((c) => !pileUuids.has(c.uuid))
        .map((c) => ({ id: c.uuid, value: c.value })),
    );
    this.touch();
  }

  /**
   * Detect when another player plays a single card (count −1) and fly it from their fan to the
   * pile. A forfeit drops the count by more than one, so it is deliberately not animated the same.
   */
  private flyOpponentPlays(): void {
    const counts = this.state()?.nrOfCardsPerPlayer;
    const played = this.state()?.playedCards ?? [];
    const prev = this.prevCounts;
    if (counts && prev) {
      for (const [pid, n] of Object.entries(counts)) {
        if (pid === this.viewerId) continue;
        if (!(pid in prev)) continue;
        const before = prev[pid];
        const dropped = before - n;
        if (dropped === 1)
          this.cardFly.opponentPlayed(pid, before, played); // played one card
        else if (dropped > 1) this.cardFly.opponentForfeit(pid, before, dropped, played); // forfeit
      }
    }
    this.prevCounts = counts ? { ...counts } : undefined;
  }

  /**
   * Announce the hand-off once: the moment your own pawns are all home in a team game, you may
   * start playing your teammate's pawns. Fires on the transition.
   */
  private announceTeamHandoff(): void {
    const allHome = this.viewerOwnPawnsAllHome();
    if (allHome && !this.prevOwnPawnsHome) {
      this.teamHandoff.show(this.i18n.t('teamHandoffTitle'), this.i18n.t('teamHandoffMessage'));
    }
    this.prevOwnPawnsHome = allHome;
  }

  /**
   * Sound effects (ported from the GWT AudioPlayer): a soft click when the turn passes to a new
   * player, and a fanfare when a player finishes (gains a place). Fires on the transition.
   */
  private playTransitionSounds(): void {
    const s = this.state();
    const cur = s?.currentPlayerId;
    if (cur && this.prevCurrentPlayerId !== undefined && cur !== this.prevCurrentPlayerId) {
      this.sound.play('turnChange');
    }
    if (cur) this.prevCurrentPlayerId = cur;

    const medals = (s?.players ?? []).filter((p) => (p.place ?? -1) > -1).length;
    if (this.prevMedalCount >= 0 && medals > this.prevMedalCount) {
      this.sound.play('medalAwarded');
    }
    this.prevMedalCount = medals;
  }

  private prevCurrentPlayerId: string | undefined;
  private prevMedalCount = -1;

  private prevOwnPawnsHome = false;

  // ── Team card trade (step 5) — its own controller (state, view state, outcome reaction). ──
  protected readonly teamTrade = new TeamTradeController(
    () => this.state(),
    () => this.hand(),
    this.viewerId,
    (otherId, received, given) => this.cardFly.tradeSwap(otherId, received, given),
    (title, message) => this.teamHandoff.show(title, message),
    (key, ...args) => this.i18n.t(key, ...args),
  );

  // The players whose pawns the viewer may move: themselves, plus their teammate once all the
  // viewer's own pawns are home (team play phase-2). Fed to the selection so a teammate's pawns
  // become selectable — the backend enforces the same rule.
  private readonly controllablePlayerIds = computed(() => {
    const me = this.viewerId;
    if (!me) return [];
    const ids = [me];
    if (this.viewerOwnPawnsAllHome()) {
      const s = this.state();
      const myTeam = s?.players?.find((p) => p.id === me)?.teamId;
      const mate =
        myTeam != null ? s?.players?.find((p) => p.id !== me && p.teamId === myTeam) : undefined;
      if (mate) ids.push(mate.id);
    }
    return ids;
  });

  // Team play: are all of the viewer's own pawns home (finish tiles, tileNr ≥ 16)? Drives the
  // one-time hand-off announcement. False outside a team game.
  private readonly viewerOwnPawnsAllHome = computed(() => {
    const s = this.state();
    if (!s?.pawns || !s.players || !this.viewerId) return false;
    const inTeam = s.players.find((p) => p.id === this.viewerId)?.teamId != null;
    if (!inTeam) return false;
    const own = s.pawns.filter((p) => p.playerId === this.viewerId);
    return own.length > 0 && own.every((p) => (p.currentTileId?.tileNr ?? -1) >= 16);
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

  // Reactive selectors over the selection (reading rev() makes them recompute).
  protected readonly selectedCardUuid = computed(() => (this.rev(), this.selection.getCard()?.id));
  protected readonly pawn1Id = computed(() => (this.rev(), this.selection.getPawnId1()));
  protected readonly pawn2Id = computed(() => (this.rev(), this.selection.getPawnId2()));
  protected readonly splitVisible = computed(
    () => (this.rev(), this.selection.isSplitBoxesVisible()),
  );
  protected readonly stepsPawn1 = computed(() => (this.rev(), this.selection.getNrStepsPawn1()));
  protected readonly stepsPawn2 = computed(() => (this.rev(), this.selection.getNrStepsPawn2()));
  protected readonly canPlay = computed(
    () => (this.rev(), this.selection.getCard() != null && this.selection.getPawn1() != null),
  );

  // The backend allows a forfeit only when the player has no legal move; when they
  // do have one they must play it, so the Forfeit button is disabled. Defaults to
  // enabled until a state with the flag arrives (don't lock the player out).
  protected readonly canForfeit = computed(() => this.state()?.canForfeit ?? true);

  protected selectCard(uuid: number): void {
    const handCard = this.hand().find((c) => c.uuid === uuid);
    if (!handCard) return;
    this.selection.setCard({ id: handCard.uuid, value: handCard.value });
    this.touch();
    this.checkMove();
  }

  /** The card value currently hovered in the hand (drives the hint), or null. */
  private readonly hoveredCardValue = signal<number | null>(null);
  protected hoverCard(value: number | null): void {
    this.hoveredCardValue.set(value);
  }

  /**
   * Hint/suggestion for the special card the player is eyeing: the hovered card,
   * falling back to the selected card when nothing is hovered. Empty for a regular
   * card — only Ace/Four/Seven/Jack/Queen/King have a hint (mirrors the GWT
   * updateCardHint). `rev()` makes it recompute when the selection changes.
   */
  protected readonly hint = computed(() => {
    this.rev();
    const key = hintKeyFor(this.hoveredCardValue() ?? this.selection.getCard()?.value ?? null);
    return key ? this.i18n.t(key) : '';
  });

  protected selectPawn(id: string): void {
    this.selection.addPawnById(id);
    this.touch();
    this.checkMove();
  }

  // Tiles the previewed move would land on (key = "playerId:tileNr"); they pulse.
  protected readonly previewTiles = signal<Set<string>>(new Set());
  protected isPreview(playerId: string, tileNr: number): boolean {
    return this.previewTiles().has(`${playerId}:${tileNr}`);
  }

  // Of those, the ones that would land on a teammate's pawn (team play only) — the board warns on
  // these in red instead of the usual gold.
  protected readonly teammateCaptureTiles = computed(() =>
    teammateCaptureTiles(
      this.previewTiles(),
      this.state()?.pawns ?? [],
      this.state()?.players ?? [],
      this.viewerId,
    ),
  );
  protected isTeammateCapture(playerId: string, tileNr: number): boolean {
    return this.teammateCaptureTiles().has(`${playerId}:${tileNr}`);
  }

  // Preview the current selection: ask the server which tile(s) it would land on
  // and pulse them. When a 7-split first forms, adopt the recommended allocation
  // once, then re-check to preview it. Mirrors the GWT presenter's checkMove().
  /**
   * Assemble the current (card + pawn) selection into a MoveRequest, or undefined if it isn't yet
   * a complete, resolvable move. Shared by the live preview (checkMove) and the actual play.
   */
  private buildMoveRequest(
    tempMessageType: MoveRequest['tempMessageType'],
  ): MoveRequest | undefined {
    const card = this.selection.getCard();
    const pawn1 = this.selection.getPawn1();
    if (!card || !pawn1 || !this.viewerId) return undefined;
    const apiPawn1 = this.findPawn(pawn1.id);
    if (!apiPawn1) return undefined;
    const apiPawn2 = this.selection.getPawn2()?.id;
    return {
      playerId: this.viewerId,
      cardId: card.id,
      pawn1Id: apiPawn1.pawnId,
      pawn2Id: apiPawn2 ? this.findPawn(apiPawn2)?.pawnId : undefined,
      stepsPawn1: this.selection.getNrStepsPawn1(),
      stepsPawn2: this.selection.getNrStepsPawn2(),
      tempMessageType,
    };
  }

  private checkMove(): void {
    const move = this.buildMoveRequest('CHECK_MOVE');
    if (!move || !this.sessionId || !this.viewerId) {
      this.previewTiles.set(new Set());
      return;
    }
    this.movesService.checkMove(this.sessionId, this.viewerId, move).subscribe({
      next: (res) => {
        // First time a 7-split forms: adopt the recommended split, then re-check.
        if (this.selection.isSplitDefaultPending()) {
          this.selection.clearSplitDefaultPending();
          const s1 = res.recommendedStepsPawn1 ?? -1;
          const s2 = res.recommendedStepsPawn2 ?? -1;
          if (s1 >= 0 && s2 >= 0) {
            this.selection.setNrStepsPawn1(s1);
            this.selection.setNrStepsPawn2(s2);
            this.touch();
            this.checkMove();
            return;
          }
        }
        // Highlight the landing tile(s) — the last tile of each pawn's path.
        this.previewTiles.set(new Set((res.tiles ?? []).map((t) => `${t.playerId}:${t.tileNr}`)));
      },
      error: () => {
        /* fire-and-forget: errors are non-critical here */
      },
    });
  }

  // The 7-split step inputs (shown when splitVisible()).
  protected onStepsPawn1(value: string): void {
    this.selection.setNrStepsPawn1ForSplit(value);
    this.touch();
    this.checkMove();
  }
  protected onStepsPawn2(value: string): void {
    this.selection.setNrStepsPawn2ForSplit(value);
    this.touch();
    this.checkMove();
  }

  // The − / + steppers; setNr...ForSplit wraps 8→0 and −1→7, like the GWT.
  protected stepPawn1(delta: number): void {
    this.onStepsPawn1(String(this.stepsPawn1() + delta));
  }
  protected stepPawn2(delta: number): void {
    this.onStepsPawn2(String(this.stepsPawn2() + delta));
  }

  // Step-box label + input-border colours match each pawn's board highlight colour
  // (which depends on the pawn's own colour), like the GWT updateStepBoxColors.
  protected readonly pawn1Highlight = computed(() =>
    stepBoxColor(this.pawn1Id(), this.state()?.players ?? [], 1),
  );
  protected readonly pawn2Highlight = computed(() =>
    stepBoxColor(this.pawn2Id(), this.state()?.players ?? [], 2),
  );

  protected readonly highlightForPawn1 = highlightForPawn1;
  protected readonly highlightForPawn2 = highlightForPawn2;

  // Submit the current selection (the green "play card" button). The server
  // re-derives the move type from the card + pawns, so we just send the pieces.
  protected playCard(): void {
    const card = this.selection.getCard();
    const pawn1 = this.selection.getPawn1();
    if (!card || !pawn1 || !this.sessionId || !this.viewerId) return;
    this.sound.play('buttonClick');

    // Explain selections the server would reject with a bare 400 (no reason),
    // instead of misreporting them as "not your turn".
    const localKey = localRejectionKey(pawn1.tileNr, card.value);
    if (localKey) {
      this.rejection.show(this.i18n.t(localKey));
      return;
    }

    const move = this.buildMoveRequest('MAKE_MOVE');
    if (!move) return;
    const handCard = this.hand().find((c) => c.uuid === card.id);
    this.send(handCard, move);
  }

  private send(card: CardModel | undefined, move: MoveRequest): void {
    if (!this.sessionId || !this.viewerId) return;
    this.previewTiles.set(new Set()); // stop the move preview while submitting
    // Snapshot the played card's current hand slot BEFORE sending: the server push
    // will have removed it from the hand by the time the move is confirmed, so on
    // success we fly a clone from here (ported from the GWT captureCardStartPos).
    const start = card ? this.cardTable.cards().find((c) => c.uuid === card.uuid) : undefined;
    this.touch();
    this.movesService.makeMove(this.sessionId, this.viewerId, move).subscribe({
      next: (response) => {
        if (response.result === 'CAN_MAKE_MOVE') {
          this.selection.reset(); // accepted → clear the selection
          // Fly the captured card (its id + face + hand slot) to the pile, popping as it goes.
          if (start) this.cardTable.flyToPile(start, { pop: true });
          else if (card) this.cardTable.pile.update((p) => [...p, card]);
          this.touch();
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
    // Snapshot my hand-card positions BEFORE the server push clears them, then fly
    // each to the pile, staggered (same as an opponent's forfeit).
    const myCards = this.cardTable.cards().filter((c) => !c.inPile);
    this.cardsService.playerForfeits(this.sessionId, this.viewerId).subscribe({
      error: () => {
        /* fire-and-forget: errors are non-critical here */
      },
    });
    this.selection.reset();
    this.previewTiles.set(new Set());
    this.touch();
    myCards.forEach((c, i) => setTimeout(() => this.cardTable.flyToPile(c), i * 120));
  }
}
