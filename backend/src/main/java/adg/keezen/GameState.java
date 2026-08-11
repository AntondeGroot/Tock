package adg.keezen;

import static adg.util.CardValueCheck.isAce;
import static adg.util.CardValueCheck.isKing;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.PLAYER_DOES_NOT_HAVE_CARD;

import adg.Log;
import adg.processing.ProcessOnBoard;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
import adg.processing.ProcessOnSwitch;
import adg.util.PlayerStatus;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import com.adg.openapi.model.TempMessageType;
import jakarta.annotation.Nullable;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.stream.Collectors;

public final class GameState {

  private ArrayList<Pawn> pawns = new ArrayList<>();
  private final ArrayList<Player> players = new ArrayList<>();
  private final HashMap<String, Integer> playerColors =
      new HashMap<>(); // to map a player UUID to an int for player Colors
  private final ArrayList<String> winners = new ArrayList<>();
  private final HashSet<String> leavers = new HashSet<>();
  private static final int MAX_PLAYERS = 8;
  private static final int PAWNS_PER_PLAYER = 4;
  private final CardsDeckInterface cardsDeck;
  private volatile int animationSpeed;
  private volatile boolean exactMoveRequired = false;
  private volatile boolean mustPlayIfPossible = false;
  private volatile boolean teamPlay = false;
  private final TradeManager tradeManager;
  private final TileReachability tileReachability;
  private final PlayerRoster roster;
  private final PawnLocations pawnLocations;
  private final WinnerDetection winnerDetection;
  private final TurnOrder turnOrder;
  private volatile long mustPlayBlockedSinceMs = 0;
  private static final long MUST_PLAY_TIMEOUT_MS = 3 * 60 * 1000L;
  private Boolean hasStarted = false;
  private final AtomicLong version =
      new AtomicLong(0); // to make it compatible with javascript as it doesn't do int64 well!

  // Collaborators only capture the this::getPawn reference; it is not invoked during construction.
  @SuppressWarnings("this-escape")
  public GameState(CardsDeckInterface cardsDeck) {
    this.cardsDeck = cardsDeck;
    this.roster = new PlayerRoster(players, playerColors);
    this.pawnLocations = new PawnLocations(() -> pawns);
    this.tradeManager =
        new TradeManager(
            cardsDeck, version, () -> hasStarted && teamPlay, this::teammateOf, this::isKingOrAce);
    this.tileReachability = new TileReachability(this::getPawn, roster::previousPlayerId);
    this.winnerDetection =
        new WinnerDetection(
            players, leavers, roster, pawnLocations, cardsDeck, version, () -> teamPlay);
    this.turnOrder =
        new TurnOrder(players, winners, leavers, roster, this::clearMustPlayBlocked);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public void start() {
    start(true);
  }

  public void start(boolean shuffle) {
    hasStarted = true;
    if (shuffle) shufflePlayers();
    assignPlayerInts();
    assignTeams();
    activateAllPlayers();
    turnOrder.resetActivePlayers();
    initializePawns();
    initializeCards();
    turnOrder.resetToFirstPlayer();
  }

  public void stop() {
    hasStarted = false;
    pawns.clear();
    players.clear();
    playerColors.clear();
    turnOrder.clearActive();
    winners.clear();
    tradeManager.clearPending();
  }

  public void reset() {
    resetWinners();
    resetPawnPositions();
    resetActivePlayers();
    resetCards();
    turnOrder.resetToFirstPlayer();
    tradeManager.clearPending();
    version.incrementAndGet();
  }

  public void tearDown() {
    pawns = new ArrayList<>();
    players.clear();
    winners.clear();
    turnOrder.tearDownTo("0");
  }

  // ── Start helpers ─────────────────────────────────────────────────────────

  private void assignPlayerInts() {
    // playerInts determine the order in which the players play and which colors they have; the
    // playerColors map holds the same seat index (the roster reads it for turn order). After shuffle.
    int seat = 0;
    for (Player player : players) {
      player.setPlayerInt(seat);
      playerColors.put(player.getId(), seat);
      seat++;
    }
  }

  /**
   * In team play, teams are PAIRS: each player teams up with the player directly opposite
   * (seat + n/2). So n players make n/2 teams — 4→2, 6→3, 8→4. teamId = seat % (n/2), which
   * pairs seat i with seat i+n/2 under the same id. Assigned only for an even count of at least
   * four (2 players would be a single pair with no opponents; odd counts can't pair) — otherwise
   * teamId stays null, the state omits it, and the roster shows no teams. Runs after
   * assignPlayerInts.
   */
  private void assignTeams() {
    int n = players.size();
    if (!teamPlay) return;
    if (n < 4 || n % 2 != 0) {
      // Teams need an even count of at least four; with fewer or an odd count there are no pairs.
      // Turn team play OFF so every downstream check (win detection, move gating, trades, the
      // client push) reverts to individual play — otherwise a lone player's win is never recorded
      // because the team win-check keeps waiting for a partner that doesn't exist.
      teamPlay = false;
      return;
    }
    int teamCount = n / 2;
    // The loop index is the seat: this runs right after assignPlayerInts over the same list,
    // so index == playerInt (and avoids unboxing the nullable getPlayerInt()).
    int seat = 0;
    for (Player player : players) {
      player.setTeamId(seat % teamCount);
      seat++;
    }
  }

  private void shufflePlayers() {
    Collections.shuffle(players);
  }

  private void activateAllPlayers() {
    for (Player p : players) {
      p.setIsActive(true);
    }
  }

  private void initializePawns() {
    pawns = new ArrayList<>();
    for (Player player : players) {
      for (int pawnNr = 0; pawnNr < PAWNS_PER_PLAYER; pawnNr++) {
        PositionKey nestPosition = new PositionKey(player.getId(), -1 - pawnNr);
        pawns.add(new Pawn(player.getId(), new PawnId(player.getId(), pawnNr), nestPosition, nestPosition));
      }
    }
  }

  private void initializeCards() {
    cardsDeck.addPlayers(players);
    dealRoundCards();
  }

  /** Deal this round's hands — the deck only reshuffles on the first round of the game. */
  private void dealRoundCards() {
    cardsDeck.shuffleIfFirstRound();
    cardsDeck.dealCards();
  }

  // ── Reset helpers ─────────────────────────────────────────────────────────

  private void resetWinners() {
    winners.clear();
    for (Player player : players) {
      player.setPlace(-1);
    }
  }

  private void resetPawnPositions() {
    for (Pawn p : pawns) {
      p.setCurrentTileId(p.getNestTileId());
    }
  }

  private void resetCards() {
    cardsDeck.reset();
    initializeCards();
  }

  // ── Player management ─────────────────────────────────────────────────────

  public void addPlayer(Player player) {
    if (!players.contains(player) && players.size() < MAX_PLAYERS) {
      player.setIsActive(true);
      player.setPlace(-1);
      player.isPlaying(false);
      players.add(player);
      version.incrementAndGet();
    }
  }

  public void processLeaveGame(String playerId) {
    cardsDeck.forfeitCardsForPlayer(playerId);
    cancelTradeForDeparture(playerId);
    leavers.add(playerId);
    removePawnsForPlayer(playerId);
    deactivateAndStopPlayingPlayer(playerId);
    // Only hand off the turn if the player who left was actually on it.
    removeFromRoundAndAdvance(playerId, playerId.equals(turnOrder.getPlayerIdTurn()));
    version.incrementAndGet();
  }

  public void forfeitPlayer(String playerId) {
    deactivatePlayerById(playerId);
    // A forfeiting player is always the one on turn, so the turn always moves on.
    removeFromRoundAndAdvance(playerId, true);
    version.incrementAndGet();
  }

  public void processOnForfeit(String playerId) {
    cardsDeck.forfeitCardsForPlayer(playerId);
    cancelTradeForDeparture(playerId);
    forfeitPlayer(playerId);
    version.incrementAndGet();
  }

  // ── Player management helpers ─────────────────────────────────────────────

  /**
   * Drop the player from the round: if that leaves no one active, start a fresh round; otherwise
   * remove them from the active list and, when {@code advanceTurn}, pass the turn to the next
   * active player.
   */
  private void removeFromRoundAndAdvance(String playerId, boolean advanceTurn) {
    if (turnOrder.allActivePlayersExhausted()) {
      startNewRound();
    } else {
      turnOrder.removeActive(playerId);
      if (advanceTurn) {
        turnOrder.nextActivePlayer();
      }
    }
  }

  /** Apply an action to the player with this id, if they're still in the game. */
  private void withPlayer(String playerId, Consumer<Player> action) {
    Player player = findPlayerById(playerId);
    if (player != null) {
      action.accept(player);
    }
  }

  private void deactivatePlayerById(String playerId) {
    withPlayer(playerId, PlayerStatus::setInactive);
  }

  /** A departed player is out of the game — take their pawns off the board entirely. */
  private void removePawnsForPlayer(String playerId) {
    pawns.removeIf(pawn -> playerId.equals(pawn.getPlayerId()));
  }

  private void deactivateAndStopPlayingPlayer(String playerId) {
    withPlayer(playerId, player -> {
      PlayerStatus.setInactive(player);
      player.setIsPlaying(false);
    });
  }

  private void startNewRound() {
    turnOrder.resetActivePlayers();
    dealRoundCards();
    turnOrder.nextRoundPlayer();
  }

  public void resetActivePlayers() {
    turnOrder.resetActivePlayers();
  }

  public boolean allPlayersHaveLeft() {
    return !players.isEmpty() && players.stream().allMatch(p -> leavers.contains(p.getId()));
  }

  // ── Turn management ───────────────────────────────────────────────────────

  /**
   * Plays the card and advances the game turn. Call this after physically moving pawns.
   * When goToNextPlayer is false (split first pawn) the card is consumed but the turn is not yet
   * advanced; the second processOnMove call with goToNextPlayer=true will advance it.
   */
  public void finishTurn(String playerId, Card card, boolean goToNextPlayer) {
    cardsDeck.playCard(playerId, card);
    boolean noCardsLeft = !cardsDeck.playerHasCardsLeft(playerId);
    if (goToNextPlayer) {
      advanceTurnAfterPlay(playerId, noCardsLeft);
      version.incrementAndGet();
    }
  }

  public void removeWinnerFromActivePlayerList() {
    turnOrder.removeWinnersFromActive();
  }

  // ── Turn management helpers ───────────────────────────────────────────────

  private void advanceTurnAfterPlay(String playerId, boolean noCardsLeft) {
    if (noCardsLeft) {
      forfeitPlayer(playerId);
    } else {
      turnOrder.nextActivePlayer();
    }
    checkForWinners(winners);
    turnOrder.removeWinnersFromActive();
    if (turnOrder.roundIsOverButGameContinues()) {
      startNewRound();
    }
  }

  // ── Move processing ───────────────────────────────────────────────────────

  public void processOnMove(MoveRequest moveMessage, MoveResponse response) {
    ProcessOnMove.process(this, moveMessage, response);
  }

  public void processOnMove(MoveRequest moveMessage, MoveResponse response, boolean goToNextPlayer) {
    ProcessOnMove.process(this, moveMessage, response, goToNextPlayer);
  }

  public void processOnSplit(MoveRequest moveMessage, MoveResponse response) {
    ProcessOnSplit.process(this, moveMessage, response);
  }

  public void processOnSwitch(MoveRequest moveMessage, MoveResponse moveResponse) {
    ProcessOnSwitch.process(this, moveMessage, moveResponse);
  }

  public void processOnBoard(MoveRequest moveMessage, MoveResponse response) {
    ProcessOnBoard.process(this, moveMessage, response);
  }

  public void processMove(
      Pawn pawn, PositionKey targetTileId, MoveRequest moveMessage, MoveResponse response) {
    processMove(pawn, targetTileId, moveMessage, response, true);
  }

  public void processMove(
      Pawn pawn0,
      PositionKey targetTileId,
      MoveRequest moveMessage,
      MoveResponse response,
      boolean goToNextPlayer) {

    String playerId = moveMessage.getPlayerId();
    Card card = playableCard(moveMessage);
    if (card == null) {
      rejectMove(response, PLAYER_DOES_NOT_HAVE_CARD);
      return;
    }
    if (cannotMoveToTileBecauseSamePlayer(pawn0, targetTileId)) {
      rejectMove(response, CANNOT_MAKE_MOVE);
      return;
    }

    handleKillIfPresent(pawn0, targetTileId, moveMessage, response);

    response.setPawn1(pawn0);
    if (isMakeMove(moveMessage)) {
      movePawn(new Pawn(pawn0.getPlayerId(), pawn0.getPawnId(), targetTileId, pawn0.getNestTileId()));
      // goToNextPlayer is false only for the first pawn of a SPLIT move; the second call advances
      finishTurn(playerId, card, goToNextPlayer);
    }

    response.setResult(CAN_MAKE_MOVE);
    Log.info("GameState: pawn moves to " + targetTileId + ", with response " + response);
  }

  // ── Move helpers ──────────────────────────────────────────────────────────

  /** Reject a move: wipe any partially-built move data and report why it can't be made. */
  private void rejectMove(MoveResponse response, MoveResult result) {
    clearResponse(response);
    response.setResult(result);
  }

  /** The card the player is trying to play, or null if none was given or they don't hold it. */
  private Card playableCard(MoveRequest moveMessage) {
    Integer cardId = moveMessage.getCardId();
    if (cardId == null) {
      return null;
    }
    return getCard(cardId, moveMessage.getPlayerId());
  }

  private void handleKillIfPresent(
      Pawn pawn0, PositionKey targetTileId, MoveRequest moveMessage, MoveResponse response) {
    Pawn pawnOnTarget = getPawn(targetTileId);
    if (pawnOnTarget == null) return;
    if (Objects.equals(pawnOnTarget.getPlayerId(), pawn0.getPlayerId())) return;

    response.setPawn1(pawn0);
    response.setPawn2(null);
    LinkedList<PositionKey> killMove = new LinkedList<>();
    killMove.add(targetTileId);
    killMove.add(pawnOnTarget.getNestTileId());
    response.setPawnKilledByPawn1(pawnOnTarget);
    response.setMovePawnKilledByPawn1(killMove);
    if (isMakeMove(moveMessage)) {
      movePawn(new Pawn(
          pawnOnTarget.getPlayerId(),
          pawnOnTarget.getPawnId(),
          pawnOnTarget.getNestTileId(),
          pawnOnTarget.getNestTileId()));
    }
  }

  // ── Winner tracking ───────────────────────────────────────────────────────

  public void checkForWinners(ArrayList<String> winners) {
    winnerDetection.check(winners);
  }

  private boolean hasAllPawnsOnFinish(String playerId) {
    return pawnLocations.allPawnsOnFinish(playerId);
  }

  /**
   * Team-play hand-off rule: you may move your own pawns freely, but a teammate's pawns only
   * once all of your own are home — and never a non-teammate's pawn. No restriction when teams
   * are off. Gated at the move entry point so every move type inherits it.
   */
  public boolean isTeamMoveAllowed(String moverId, Pawn pawn) {
    if (!teamPlay || pawn == null) {
      return true;
    }
    String owner = pawn.getPlayerId();
    return owner.equals(moverId) || mayControlTeammatePawn(moverId, owner);
  }

  private boolean sameTeam(String playerA, String playerB) {
    return roster.sameTeam(playerA, playerB);
  }

  /**
   * The shared team-control rule: a teammate's pawn may be played only once all your own pawns are
   * home. An opponent is never the same team, so this is also false for their pawns.
   */
  private boolean mayControlTeammatePawn(String moverId, String ownerId) {
    return sameTeam(moverId, ownerId) && hasAllPawnsOnFinish(moverId);
  }

  /**
   * Whether the mover may control (move/switch) this pawn: always their own, and — in team play,
   * once all their own pawns are home — their teammate's. Used by the move processors' ownership
   * checks so a teammate's pawns can be played, while opponents' stay off-limits.
   */
  public boolean mayControlPawn(String moverId, Pawn pawn) {
    if (pawn == null) {
      return false;
    }
    String owner = pawn.getPlayerId();
    return owner.equals(moverId) || (teamPlay && mayControlTeammatePawn(moverId, owner));
  }

  // ── Team card trade (step 5) ──────────────────────────────────────────────

  public void setTeamCardTrade(boolean teamCardTrade) {
    tradeManager.setEnabled(teamCardTrade);
  }

  public boolean isTeamCardTrade() {
    return tradeManager.isEnabled();
  }

  /** The pending team card-trade for this player's team, if any (each team trades independently). */
  public TradeRequest getPendingTradeFor(String playerId) {
    return tradeManager.getPendingFor(playerId);
  }

  public boolean requestTrade(String requesterId) {
    return tradeManager.request(requesterId);
  }

  /** The requester names (or renames) the card they give in return. */
  public boolean offerTradeCard(String requesterId, Card offeredCard) {
    return tradeManager.offer(requesterId, offeredCard);
  }

  /** Whether this player may open a team card trade right now (drives the "ask" button). */
  public boolean canRequestTrade(String playerId) {
    return tradeManager.canRequest(playerId);
  }

  public boolean acceptTrade(String teammateId, Card kingOrAce) {
    return tradeManager.accept(teammateId, kingOrAce);
  }

  public boolean rejectTrade(String teammateId) {
    return tradeManager.reject(teammateId);
  }

  public boolean cancelTrade(String requesterId) {
    return tradeManager.cancel(requesterId);
  }

  private void cancelTradeForDeparture(String playerId) {
    tradeManager.cancelForDeparture(playerId);
  }

  private String teammateOf(String playerId) {
    return roster.teammateOf(playerId);
  }

  private boolean isKingOrAce(Card card) {
    return isKing(card) || isAce(card);
  }

  // ── Board logic ───────────────────────────────────────────────────────────

  public boolean isPawnOnLastSection(String playerId, String sectionId) {
    return sectionId.equals(previousPlayerId(playerId));
  }

  public boolean isPawnLooselyClosedIn(Pawn pawn, PositionKey tileId) {
    return tileReachability.isPawnLooselyClosedIn(pawn, tileId);
  }

  public boolean isPawnTightlyClosedIn(Pawn pawn, PositionKey tileId) {
    return tileReachability.isPawnTightlyClosedIn(pawn, tileId);
  }

  public boolean canMoveToTile(Pawn selectedPawn, PositionKey nextTileId) {
    return tileReachability.canMoveToTile(selectedPawn, nextTileId);
  }

  public boolean cannotMoveToTileBecauseSamePlayer(Pawn selectedPawn, PositionKey nextTileId) {
    return tileReachability.cannotMoveToTileBecauseSamePlayer(selectedPawn, nextTileId);
  }

  public boolean canPassStartTile(Pawn selectedPawn, PositionKey tileId) {
    return tileReachability.canPassStartTile(selectedPawn, tileId);
  }

  public boolean tileIsABlockade(PositionKey selectedStartTile) {
    return tileReachability.tileIsABlockade(selectedStartTile);
  }

  public int checkHighestTileNrYouCanMoveTo(Pawn pawn, PositionKey tileId, int nrSteps) {
    return tileReachability.checkHighestTileNrYouCanMoveTo(pawn, tileId, nrSteps);
  }

  public ArrayList<PositionKey> pingpongMove(Pawn pawn, PositionKey tileId, int nrSteps) {
    return tileReachability.pingpongMove(pawn, tileId, nrSteps);
  }

  public PositionKey moveAndCheckEveryTile(Pawn pawn, PositionKey tileId, int nrSteps) {
    return tileReachability.moveAndCheckEveryTile(pawn, tileId, nrSteps);
  }

  public boolean moveBouncesOffWall(Pawn pawn, PositionKey tileId, int nrSteps) {
    return tileReachability.moveBouncesOffWall(pawn, tileId, nrSteps);
  }

  // ── Player navigation ─────────────────────────────────────────────────────

  public String nextPlayerId(String playerId) {
    return roster.nextPlayerId(playerId);
  }

  public String previousPlayerId(String playerId) {
    return roster.previousPlayerId(playerId);
  }

  // ── Pawn helpers ──────────────────────────────────────────────────────────

  /** Public for testing: set a pawn's location without triggering any validation. */
  public void movePawn(Pawn selectedPawn) {
    pawnLocations.moveTo(selectedPawn);
  }

  public Pawn getPawn(Pawn selectedPawn) {
    return pawnLocations.withId(selectedPawn.getPawnId());
  }

  public Pawn getPawn(PawnId selectedPawnId) {
    return pawnLocations.withId(selectedPawnId);
  }

  public Pawn getPawn(PositionKey selectedTileId) {
    return pawnLocations.atTile(selectedTileId);
  }

  public ArrayList<Pawn> getPawns() {
    return pawns;
  }

  // ── Player helpers ────────────────────────────────────────────────────────

  @Nullable
  private Player findPlayerById(String playerId) {
    return roster.findById(playerId);
  }

  public ArrayList<Player> getPlayers() {
    return players;
  }

  public ArrayList<String> getActivePlayers() {
    return players.stream()
        .filter(Player::getIsActive)
        .map(Player::getId)
        .collect(Collectors.toCollection(ArrayList::new));
  }

  public HashMap<String, Integer> getPlayerColors() {
    return playerColors;
  }

  public ArrayList<String> getWinners() {
    return winners;
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  public Card getCard(int cardUUID, String playerId) {
    for (Card card : cardsDeck.getCardsForPlayer(playerId)) {
      if (card.getUuid().equals(cardUUID)) {
        return card;
      }
    }
    System.out.println("Card not found for " + playerId + " " + cardUUID);
    return null;
  }

  public boolean playerHasCard(String playerId, Card card) {
    return cardsDeck.playerHasCard(playerId, card);
  }

  public void duplicatePlayerCard(String playerId, Card card) {
    cardsDeck.setPlayerCard(playerId, card);
  }

  public boolean isMakeMove(MoveRequest request) {
    return TempMessageType.MAKE_MOVE.equals(request.getTempMessageType());
  }

  public void clearResponse(MoveResponse response) {
    response.setPawn1(null);
    response.setPawn2(null);
    response.setMoveType(null);
    response.setMovePawn1(null);
    response.setMovePawn2(null);
  }

  public Boolean hasStarted() {
    return hasStarted;
  }

  public long getVersion() {
    return version.get();
  }

  public int getNrPlayers() {
    return players.size();
  }

  public String getPlayerIdTurn() {
    return turnOrder.getPlayerIdTurn();
  }

  /**
   * for testing purposes
   */
  public void setPlayerIdTurn(String playerId) {
    turnOrder.setPlayerIdTurn(playerId);
  }

  public void setAnimationSpeed(int speed) {
    animationSpeed = speed;
  }

  public int getAnimationSpeed() {
    return animationSpeed;
  }

  public void setExactMoveRequired(boolean exactMoveRequired) {
    this.exactMoveRequired = exactMoveRequired;
  }

  public boolean isExactMoveRequired() {
    return exactMoveRequired;
  }

  public void setMustPlayIfPossible(boolean mustPlayIfPossible) {
    this.mustPlayIfPossible = mustPlayIfPossible;
  }

  public boolean isMustPlayIfPossible() {
    return mustPlayIfPossible;
  }

  public void setTeamPlay(boolean teamPlay) {
    this.teamPlay = teamPlay;
  }

  public boolean isTeamPlay() {
    return teamPlay;
  }

  public void recordMustPlayBlocked() {
    if (mustPlayBlockedSinceMs == 0) {
      mustPlayBlockedSinceMs = System.currentTimeMillis();
    }
  }

  public void clearMustPlayBlocked() {
    mustPlayBlockedSinceMs = 0;
  }

  public boolean mustPlayTimeoutElapsed() {
    return mustPlayBlockedSinceMs > 0
        && System.currentTimeMillis() - mustPlayBlockedSinceMs > MUST_PLAY_TIMEOUT_MS;
  }

  /** For testing: backdates the blocked-since timestamp so the timeout appears to have elapsed. */
  public void setMustPlayBlockedSince(long ms) {
    mustPlayBlockedSinceMs = ms;
  }
}