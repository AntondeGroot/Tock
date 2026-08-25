package adg.keezen;

import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.Player;
import java.util.List;
import java.util.function.BooleanSupplier;

/**
 * Who may play which pawn when teams are on, and how seats are paired into teams.
 *
 * <p>Both questions rest on the same rule — a teammate's pawn unlocks only once all of your own are
 * home — so they live together rather than being restated at each move type's entry point.
 */
class TeamPlayRules {

  private final PlayerRoster roster;
  private final PawnLocations pawnLocations;
  private final BooleanSupplier teamPlay;

  TeamPlayRules(PlayerRoster roster, PawnLocations pawnLocations, BooleanSupplier teamPlay) {
    this.roster = roster;
    this.pawnLocations = pawnLocations;
    this.teamPlay = teamPlay;
  }

  /**
   * In team play, teams are PAIRS: each player teams up with the player directly opposite
   * (seat + n/2). So n players make n/2 teams — 4→2, 6→3, 8→4. teamId = seat % (n/2), which
   * pairs seat i with seat i+n/2 under the same id. Assigned only for an even count of at least
   * four (2 players would be a single pair with no opponents; odd counts can't pair) — otherwise
   * teamId stays null, the state omits it, and the roster shows no teams. Runs after
   * assignPlayerInts.
   *
   * @return whether team play is actually in effect afterwards. Returns false for a player count
   *     that cannot be paired, so every downstream check (win detection, move gating, trades, the
   *     client push) reverts to individual play — otherwise a lone player's win is never recorded
   *     because the team win-check keeps waiting for a partner that doesn't exist.
   */
  boolean assignTeams(List<Player> players) {
    if (!teamPlay.getAsBoolean()) return false;
    // Count the people, not the seats: a widened two-player board has four seats but only two
    // players, and pairing on the seat count would make those two opponents each other's teammate.
    List<Player> seated = roster.seatedPlayers();
    int n = seated.size();
    if (n < 4 || n % 2 != 0) {
      return false;
    }
    int teamCount = n / 2;
    // The loop index is the seat: this runs right after assignPlayerInts over the same list,
    // so index == playerInt (and avoids unboxing the nullable getPlayerInt()).
    int seat = 0;
    for (Player player : seated) {
      player.setTeamId(seat % teamCount);
      seat++;
    }
    return true;
  }

  /**
   * Team-play hand-off rule: you may move your own pawns freely, but a teammate's pawns only
   * once all of your own are home — and never a non-teammate's pawn. No restriction when teams
   * are off. Gated at the move entry point so every move type inherits it.
   */
  boolean isMoveAllowed(String moverId, Pawn pawn) {
    if (!teamPlay.getAsBoolean() || pawn == null) {
      return true;
    }
    String owner = pawn.getPlayerId();
    return owner.equals(moverId) || mayControlTeammatePawn(moverId, owner);
  }

  /**
   * Whether the mover may control (move/switch) this pawn: always their own, and — in team play,
   * once all their own pawns are home — their teammate's. Used by the move processors' ownership
   * checks so a teammate's pawns can be played, while opponents' stay off-limits.
   */
  boolean mayControlPawn(String moverId, Pawn pawn) {
    if (pawn == null) {
      return false;
    }
    String owner = pawn.getPlayerId();
    return owner.equals(moverId)
        || (teamPlay.getAsBoolean() && mayControlTeammatePawn(moverId, owner));
  }

  /**
   * The shared team-control rule: a teammate's pawn may be played only once all your own pawns are
   * home. An opponent is never the same team, so this is also false for their pawns.
   */
  private boolean mayControlTeammatePawn(String moverId, String ownerId) {
    return roster.sameTeam(moverId, ownerId) && pawnLocations.allPawnsOnFinish(moverId);
  }
}
