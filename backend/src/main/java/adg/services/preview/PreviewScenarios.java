package adg.services.preview;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The catalog of dev preview scenarios and the seeding that builds each one. Given a scenario path
 * it creates a fresh game session, seeds the pawn/card positions, and returns the per-player
 * "open as" links (data only — no HTML).
 */
final class PreviewScenarios {

  record Scenario(String path, String label) {}

  record PlayerLink(String label, String url, boolean isPrimary) {}

  @FunctionalInterface
  private interface Seeder {
    void seed(GameState gs, CardsDeckInterface deck, String[] ids);
  }

  private static final String[] PLAYER_NAMES = {
    "Player 1", "Player 2", "Player 3", "Player 4",
    "Player 5", "Player 6", "Player 7", "Player 8"
  };

  private static final List<Scenario> CATALOG = List.of(
      new Scenario("2-players", "2 players · mid-game, pawns spread on the board"),
      new Scenario("3-players", "3 players · early game"),
      new Scenario("4-players", "4 players · mid-game"),
      new Scenario("5-players", "5 players · mid-game"),
      new Scenario("8-players", "8 players · mid-game, full board with pawns everywhere"),
      new Scenario("team", "4 players · 2 teams, team play + card trade"),
      new Scenario("8-players-teams", "8 players · 4 teams, card trade — the fullest phone layout"),
      new Scenario("medals", "3 players · 1 winner with a medal, others still active"),
      new Scenario("game-end", "2 players · one finished; Player 2's Ace ends the game"),
      new Scenario("cards", "3 players · active player holds every special card"));

  private PreviewScenarios() {}

  static List<Scenario> all() {
    return CATALOG;
  }

  /** The human label for a scenario path, or the path itself if it isn't a known scenario. */
  static String labelFor(String path) {
    return CATALOG.stream()
        .filter(s -> s.path().equals(path))
        .map(Scenario::label)
        .findFirst()
        .orElse(path);
  }

  /** Seeds the named scenario and returns its per-player links, or null if the path is unknown. */
  static List<PlayerLink> seed(String path) {
    return switch (path) {
      case "2-players" -> setup2Players();
      case "3-players" -> setup3Players();
      case "4-players" -> setup4Players();
      case "5-players" -> setup5Players();
      case "8-players" -> setup8Players();
      case "team" -> setupTeam();
      case "8-players-teams" -> setup8PlayersInTeams();
      case "medals" -> setupMedals();
      case "game-end" -> setupGameEnd();
      case "cards" -> setupCards();
      default -> null;
    };
  }

  private static List<PlayerLink> setup2Players() {
    return setupNPlayers(2, (gs, deck, ids) -> {
      movePawn(gs, ids[0], 0, ids[1], 8);
      movePawn(gs, ids[0], 1, ids[0], 3);
      movePawn(gs, ids[1], 0, ids[0], 11);
      movePawn(gs, ids[1], 1, ids[1], 5);
    });
  }

  private static List<PlayerLink> setup3Players() {
    return setupNPlayers(3, (gs, deck, ids) -> {
      movePawn(gs, ids[0], 0, ids[1], 7);
      movePawn(gs, ids[0], 1, ids[2], 12);
      movePawn(gs, ids[1], 0, ids[0], 5);
      movePawn(gs, ids[1], 1, ids[1], 14);
      movePawn(gs, ids[2], 0, ids[2], 3);
    });
  }

  private static List<PlayerLink> setup4Players() {
    return setupNPlayers(4, (gs, deck, ids) -> {
      movePawn(gs, ids[0], 0, ids[1], 9);
      movePawn(gs, ids[0], 1, ids[3], 4);
      movePawn(gs, ids[1], 0, ids[2], 7);
      movePawn(gs, ids[1], 1, ids[0], 13);
      movePawn(gs, ids[1], 2, ids[3], 11);
      movePawn(gs, ids[2], 0, ids[1], 14);
      movePawn(gs, ids[3], 0, ids[0], 6);
      movePawn(gs, ids[3], 1, ids[2], 2);
    });
  }

  private static List<PlayerLink> setup5Players() {
    return setupNPlayers(5, (gs, deck, ids) -> {
      movePawn(gs, ids[0], 0, ids[1], 8);
      movePawn(gs, ids[0], 1, ids[3], 5);
      movePawn(gs, ids[1], 0, ids[2], 11);
      movePawn(gs, ids[1], 1, ids[4], 3);
      movePawn(gs, ids[2], 0, ids[0], 14);
      movePawn(gs, ids[2], 1, ids[3], 9);
      movePawn(gs, ids[2], 2, ids[1], 2);
      movePawn(gs, ids[3], 0, ids[4], 7);
      movePawn(gs, ids[4], 0, ids[0], 5);
    });
  }

  private static List<PlayerLink> setup8Players() {
    return setupNPlayers(8, (gs, deck, ids) -> {
      movePawn(gs, ids[0], 0, ids[1], 8);
      movePawn(gs, ids[0], 1, ids[3], 3);
      movePawn(gs, ids[1], 0, ids[2], 12);
      movePawn(gs, ids[1], 1, ids[4], 0);
      movePawn(gs, ids[1], 2, ids[6], 7);
      movePawn(gs, ids[2], 0, ids[7], 14);
      movePawn(gs, ids[3], 0, ids[0], 5);
      movePawn(gs, ids[3], 1, ids[1], 13);
      movePawn(gs, ids[5], 0, ids[5], 2);
      movePawn(gs, ids[5], 1, ids[6], 9);
      movePawn(gs, ids[5], 2, ids[7], 1);
      movePawn(gs, ids[6], 0, ids[0], 10);
      movePawn(gs, ids[6], 1, ids[2], 6);
      movePawn(gs, ids[7], 0, ids[3], 11);
    });
  }

  private static List<PlayerLink> setupTeam() {
    return setupNPlayers(4, true, (gs, deck, ids) -> {
      gs.setTeamCardTrade(true);
      // Teams pair opposite seats: ids[0]+ids[2] and ids[1]+ids[3].
      movePawn(gs, ids[0], 0, ids[0], 6);
      movePawn(gs, ids[0], 1, ids[1], 10);
      movePawn(gs, ids[2], 0, ids[2], 4);
      movePawn(gs, ids[2], 1, ids[3], 13);
      movePawn(gs, ids[1], 0, ids[0], 8);
      movePawn(gs, ids[3], 0, ids[2], 11);
    });
  }

  private static List<PlayerLink> setup8PlayersInTeams() {
    return setupNPlayers(8, true, (gs, deck, ids) -> {
      gs.setTeamCardTrade(true);
      // Teams pair opposite seats: ids[i]+ids[i+4]. Nobody has played yet, so every player can
      // still ask their teammate for a King or Ace.
      movePawn(gs, ids[0], 0, ids[1], 8);
      movePawn(gs, ids[4], 0, ids[5], 3);
      movePawn(gs, ids[1], 0, ids[3], 12);
      movePawn(gs, ids[5], 0, ids[6], 9);
      movePawn(gs, ids[2], 0, ids[7], 14);
      movePawn(gs, ids[6], 0, ids[0], 5);
      movePawn(gs, ids[3], 0, ids[2], 6);
      movePawn(gs, ids[7], 0, ids[4], 11);
    });
  }

  private static List<PlayerLink> setupMedals() {
    return setupNPlayers(3, (gs, deck, ids) -> {
      // ids[0] wins: all pawns in the finish lane.
      for (int n = 0; n < 4; n++) movePawn(gs, ids[0], n, ids[0], 16 + n);
      gs.checkForWinners(gs.getWinners());
      gs.removeWinnerFromActivePlayerList();

      // Advance the turn to ids[1].
      gs.setPlayerIdTurn(ids[1]);
      gs.getPlayers().forEach(p -> p.setIsPlaying(p.getId().equals(ids[1])));

      // Seed ids[1] and ids[2] board positions.
      movePawn(gs, ids[1], 0, ids[2], 8);
      movePawn(gs, ids[1], 1, ids[0], 3);
      movePawn(gs, ids[2], 0, ids[1], 11);
    });
  }

  private static List<PlayerLink> setupGameEnd() {
    return setupNPlayers(2, (gs, deck, ids) -> {
      // ids[0] has finished.
      for (int n = 0; n < 4; n++) movePawn(gs, ids[0], n, ids[0], 16 + n);
      gs.checkForWinners(gs.getWinners());
      gs.removeWinnerFromActivePlayerList();
      gs.setPlayerIdTurn(ids[1]);
      gs.getPlayers().forEach(p -> p.setIsPlaying(p.getId().equals(ids[1])));

      // ids[1] has three pawns home and the last one a single step away, with an Ace to play.
      for (int n = 1; n < 4; n++) movePawn(gs, ids[1], n, ids[1], 16 + n);
      movePawn(gs, ids[1], 0, ids[0], 15);
      deck.setPlayerCard(ids[1], new Card().value(1).suit(0).uuid(1)); // Ace
    });
  }

  private static List<PlayerLink> setupCards() {
    return setupNPlayers(3, (gs, deck, ids) -> {
      // Two board pawns for ids[0] so each special card is contextually relevant
      // (Ace/King: nest pawns available; Seven/Four/Queen: board pawn to move;
      //  Jack: opponents ids[1] and ids[2] are on the normal board).
      movePawn(gs, ids[0], 0, ids[1], 8);
      movePawn(gs, ids[0], 1, ids[2], 5);
      movePawn(gs, ids[1], 0, ids[0], 11);
      movePawn(gs, ids[2], 0, ids[1], 4);

      // Clear ids[0]'s dealt hand and give every special card.
      deck.forfeitCardsForPlayer(ids[0]);
      deck.setPlayerCard(ids[0], new Card().value(1).suit(0).uuid(1)); // Ace
      deck.setPlayerCard(ids[0], new Card().value(4).suit(0).uuid(4)); // Four
      deck.setPlayerCard(ids[0], new Card().value(7).suit(0).uuid(7)); // Seven
      deck.setPlayerCard(ids[0], new Card().value(11).suit(0).uuid(11)); // Jack
      deck.setPlayerCard(ids[0], new Card().value(12).suit(0).uuid(12)); // Queen
      deck.setPlayerCard(ids[0], new Card().value(13).suit(0).uuid(13)); // King
    });
  }

  private static List<PlayerLink> setupNPlayers(int n, Seeder seeder) {
    return setupNPlayers(n, false, seeder);
  }

  private static List<PlayerLink> setupNPlayers(int n, boolean teamPlay, Seeder seeder) {
    String[] ids = new String[n];
    for (int i = 0; i < n; i++) ids[i] = UUID.randomUUID().toString();

    String sid = "preview-" + System.nanoTime();
    GameRegistry.createNewGame(sid, "Preview", n);
    GameSession session = GameRegistry.getGameOrThrow(sid);
    GameState gs = session.getGameState();

    for (int i = 0; i < n; i++) {
      gs.addPlayer(new Player(ids[i], PLAYER_NAMES[i]));
    }
    gs.setTeamPlay(teamPlay);
    gs.start(false);
    seeder.seed(gs, session.getCardsDeck(), ids);

    String currentId = gs.getPlayerIdTurn();
    List<PlayerLink> links = new ArrayList<>();
    for (int i = 0; i < n; i++) {
      boolean isCurrent = ids[i].equals(currentId);
      // Relative URL: from /preview/{scenario} one "../" goes to the app root.
      String url = "../?sessionid=" + sid + "&playerid=" + ids[i];
      String label = PLAYER_NAMES[i] + (isCurrent ? " — your turn" : "");
      links.add(new PlayerLink(label, url, isCurrent));
    }
    return links;
  }

  private static void movePawn(
      GameState gs, String playerId, int pawnNr, String sectionId, int tileNr) {
    PositionKey nest = new PositionKey(playerId, -1 - pawnNr);
    gs.movePawn(
        new Pawn(playerId, new PawnId(playerId, pawnNr), new PositionKey(sectionId, tileNr), nest));
  }
}
