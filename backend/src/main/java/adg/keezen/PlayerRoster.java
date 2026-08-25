package adg.keezen;

import adg.util.PlayerStatus;
import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The player roster and seating order: look players up by id, find a teammate, and walk the turn
 * order forwards/backwards. Extracted from GameState as pure queries over the (live) players list
 * and the seat map (playerId → seat int); GameState keeps thin delegating methods.
 */
class PlayerRoster {

  private static final int MAX_PLAYERS = 8;
  private static final int PAIR = 2;
  /** Ids of the empty seats; the "p" keeps them clear of the GameRoom's uuids. */
  private static final String EMPTY_SEAT_ID = "empty-seat-p";

  private final List<Player> players;
  private final Map<String, Integer> playerColors;

  PlayerRoster(List<Player> players, Map<String, Integer> playerColors) {
    this.players = players;
    this.playerColors = playerColors;
  }

  /**
   * Seat a new player, unless they are already seated or the table is full.
   *
   * @return whether the roster actually changed, so the caller can bump the state version.
   */
  boolean add(Player player) {
    if (players.contains(player) || players.size() >= MAX_PLAYERS) {
      return false;
    }
    PlayerStatus.setActive(player);
    player.setPlace(-1);
    player.isPlaying(false);
    players.add(player);
    return true;
  }

  /**
   * Fix the seating order: each player's playerInt is their index in the (already shuffled) list,
   * and the seat map holds the same index — the turn order reads it back from there.
   */
  void assignSeats() {
    int seat = 0;
    for (Player player : players) {
      player.setPlayerInt(seat);
      playerColors.put(player.getId(), seat);
      seat++;
    }
  }

  void activateAll() {
    for (Player player : players) {
      if (!PlayerStatus.isPlaceholder(player)) {
        PlayerStatus.setActive(player);
      }
    }
  }

  /**
   * Widen a two-player table onto four seats: an empty seat is slotted in on either side of the
   * pair, so the two players end up sitting opposite each other (seats 0 and 2) with a stretch of
   * unowned board between them. Runs before {@link #assignSeats}, which then numbers all four.
   *
   * @return whether the table was actually widened — only a table of exactly two can be.
   */
  boolean seatEmptySeatsForPair() {
    if (players.size() != PAIR) {
      return false;
    }
    players.add(1, emptySeat(1));
    players.add(3, emptySeat(3));
    return true;
  }

  /** A seat nobody sits in: it owns a board section and nothing else. */
  private static Player emptySeat(int seat) {
    Player empty = new Player(EMPTY_SEAT_ID + seat, "");
    empty.setPlaceholder(true);
    empty.setIsActive(false);
    empty.setIsPlaying(false);
    empty.setPlace(-1);
    return empty;
  }

  /** The people at the table — the empty seats of a widened board are not among them. */
  List<Player> seatedPlayers() {
    return players.stream().filter(p -> !PlayerStatus.isPlaceholder(p)).toList();
  }

  /** Clear every player's finishing place, so a new round starts with nobody home. */
  void clearPlaces() {
    for (Player player : players) {
      player.setPlace(-1);
    }
  }

  ArrayList<String> activePlayerIds() {
    return players.stream()
        .filter(Player::getIsActive)
        .map(Player::getId)
        .collect(Collectors.toCollection(ArrayList::new));
  }

  /** True once every seated player has left — an empty table does not count. */
  boolean allHaveLeft(Set<String> leavers) {
    // Empty seats never leave, so counting them would keep an abandoned table alive forever.
    List<Player> seated = seatedPlayers();
    return !seated.isEmpty() && seated.stream().allMatch(p -> leavers.contains(p.getId()));
  }

  Player findById(String playerId) {
    for (Player player : players) {
      if (player.getId().equals(playerId)) {
        return player;
      }
    }
    return null;
  }

  String teammateOf(String playerId) {
    Player player = findById(playerId);
    Integer teamId = player == null ? null : player.getTeamId();
    if (teamId == null) {
      return null;
    }
    for (Player other : players) {
      if (!other.getId().equals(playerId) && teamId.equals(other.getTeamId())) {
        return other.getId();
      }
    }
    return null;
  }

  boolean sameTeam(String playerA, String playerB) {
    Player a = findById(playerA);
    Player b = findById(playerB);
    return a != null && b != null && a.getTeamId() != null && a.getTeamId().equals(b.getTeamId());
  }

  List<Player> teamMembers(int teamId) {
    return players.stream().filter(p -> Integer.valueOf(teamId).equals(p.getTeamId())).toList();
  }

  String nextPlayerId(String playerId) {
    int playerInt = playerColors.get(playerId);
    return seatOwner((playerInt + 1) % players.size());
  }

  String previousPlayerId(String playerId) {
    int playerInt = playerColors.get(playerId);
    return seatOwner((playerInt + players.size() - 1) % players.size());
  }

  /** The player sitting in the given seat, or "0" if the seat is unassigned. */
  private String seatOwner(int seat) {
    return playerColors.entrySet().stream()
        .filter(entry -> entry.getValue().equals(seat))
        .map(Map.Entry::getKey)
        .findFirst()
        .orElse("0");
  }
}
