package adg.keezen;

import com.adg.openapi.model.Player;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

/**
 * Decides who has placed and records their finishing position. In solo play a player places the
 * moment all their pawns are home; in team play a team places only when every still-present member
 * is home (a departed teammate is out and doesn't have to finish). Extracted from GameState;
 * GameState keeps a thin {@code checkForWinners} delegating here.
 */
class WinnerDetection {

  private final List<Player> players;
  private final Set<String> leavers;
  private final PlayerRoster roster;
  private final PawnLocations pawnLocations;
  private final CardsDeckInterface cardsDeck;
  private final AtomicLong version;
  private final BooleanSupplier teamPlay;

  WinnerDetection(
      List<Player> players,
      Set<String> leavers,
      PlayerRoster roster,
      PawnLocations pawnLocations,
      CardsDeckInterface cardsDeck,
      AtomicLong version,
      BooleanSupplier teamPlay) {
    this.players = players;
    this.leavers = leavers;
    this.roster = roster;
    this.pawnLocations = pawnLocations;
    this.cardsDeck = cardsDeck;
    this.version = version;
    this.teamPlay = teamPlay;
  }

  /** Record any newly-finished players (or teams) into {@code winners}, in placing order. */
  void check(List<String> winners) {
    if (teamPlay.getAsBoolean()) {
      checkTeams(winners);
      return;
    }
    for (Player player : roster.seatedPlayers()) {
      if (!winners.contains(player.getId()) && pawnLocations.allPawnsOnFinish(player.getId())) {
        record(player, winners.size() + 1, winners);
      }
    }
  }

  /**
   * In team play a team places only when <em>both</em> members have all their pawns home — so a
   * player who finishes their own pawns first gets no place yet, stays active, and keeps taking
   * turns (to play their teammate's pawns) until the pair is done. Both members share the place.
   */
  private void checkTeams(List<String> winners) {
    for (Player player : players) {
      Integer team = player.getTeamId();
      if (team == null) {
        continue;
      }
      List<Player> members = roster.teamMembers(team);
      if (members.stream().anyMatch(m -> winners.contains(m.getId()))) {
        continue; // team already placed
      }
      // A departed teammate is out of the game: their pawns are gone and don't need to come home.
      // The team places once every member STILL PRESENT has all pawns on the finish — so a lone
      // survivor wins on their own four. A fully-abandoned team can't win, and a leaver earns no
      // place (only present members are recorded).
      List<Player> present = members.stream()
          .filter(m -> !leavers.contains(m.getId()))
          .toList();
      if (!present.isEmpty() && present.stream().allMatch(m -> pawnLocations.allPawnsOnFinish(m.getId()))) {
        int place = distinctTeamsPlaced(winners) + 1;
        for (Player member : present) {
          record(member, place, winners);
        }
      }
    }
  }

  /** How many distinct teams are already in the winners list — the next team places behind them. */
  private int distinctTeamsPlaced(List<String> winners) {
    return (int) winners.stream()
        .map(roster::findById)
        .filter(p -> p != null && p.getTeamId() != null)
        .map(Player::getTeamId)
        .distinct()
        .count();
  }

  private void record(Player player, int place, List<String> winners) {
    player.setPlace(place);
    winners.add(player.getId());
    cardsDeck.forfeitCardsForPlayer(player.getId());
    player.setIsPlaying(false);
    player.setIsActive(false);
    version.incrementAndGet();
  }
}
