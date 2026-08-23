package adg.keezen;

import static adg.util.CardValueCheck.isAce;
import static adg.util.CardValueCheck.isKing;

import adg.util.Log;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import com.adg.openapi.model.TempMessageType;
import jakarta.annotation.Nullable;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

public final class GameState {

  private ArrayList<Pawn> pawns = new ArrayList<>();
  private final ArrayList<Player> players = new ArrayList<>();
  private final HashMap<String, Integer> playerColors =
      new HashMap<>(); // to map a player UUID to an int for player Colors
  private final ArrayList<String> winners = new ArrayList<>();
  private final HashSet<String> leavers = new HashSet<>();
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
  private final TeamPlayRules teamPlayRules;
  private final PlayerDeparture departure;
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
        new TurnOrder(
            players, winners, leavers, roster, this::clearMustPlayBlocked, this::dealRoundCards);
    this.teamPlayRules = new TeamPlayRules(roster, pawnLocations, () -> teamPlay);
    this.departure =
        new PlayerDeparture(
            cardsDeck, tradeManager, roster, pawnLocations, turnOrder, leavers, version);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public void start() {
    start(true);
  }

  public void start(boolean shuffle) {
    hasStarted = true;
    if (shuffle) shufflePlayers();
    roster.assignSeats();
    teamPlay = teamPlayRules.assignTeams(players);
    roster.activateAll();
    turnOrder.resetActivePlayers();
    pawns = pawnLocations.createFor(players);
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
    winners.clear();
    roster.clearPlaces();
    pawnLocations.resetAllToNest();
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


  private void shufflePlayers() {
    Collections.shuffle(players);
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



  private void resetCards() {
    cardsDeck.reset();
    initializeCards();
  }

  // ── Player management ─────────────────────────────────────────────────────

  public void addPlayer(Player player) {
    if (roster.add(player)) {
      version.incrementAndGet();
    }
  }

  public void processLeaveGame(String playerId) {
    departure.leaveGame(playerId);
  }

  public void forfeitPlayer(String playerId) {
    departure.forfeit(playerId);
  }

  public void processOnForfeit(String playerId) {
    departure.forfeitAndDiscardHand(playerId);
  }

  public void resetActivePlayers() {
    turnOrder.resetActivePlayers();
  }

  public boolean allPlayersHaveLeft() {
    return roster.allHaveLeft(leavers);
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
      departure.forfeit(playerId);
    } else {
      turnOrder.nextActivePlayer();
    }
    checkForWinners(winners);
    turnOrder.removeWinnersFromActive();
    if (turnOrder.roundIsOverButGameContinues()) {
      turnOrder.startNewRound();
    }
  }

  // ── Winner tracking ───────────────────────────────────────────────────────

  public void checkForWinners(ArrayList<String> winners) {
    winnerDetection.check(winners);
  }

  // ── Team play rules ───────────────────────────────────────────────────────

  public boolean isTeamMoveAllowed(String moverId, Pawn pawn) {
    return teamPlayRules.isMoveAllowed(moverId, pawn);
  }

  public boolean mayControlPawn(String moverId, Pawn pawn) {
    return teamPlayRules.mayControlPawn(moverId, pawn);
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
    return roster.activePlayerIds();
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