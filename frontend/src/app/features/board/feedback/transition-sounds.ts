import { GameStatePush } from '../../../api';
import { SoundService } from '../../../sound.service';
import { allPawnsHome } from '../selection/team-control';

/**
 * Everyone whose race is over: all four pawns home, or a place already recorded. The two are not
 * the same moment in team play — you bring your own four home well before your team places — and
 * the place is what survives when the pawns don't (a snapshot without them, a finished game).
 */
function finishedPlayers(state: GameStatePush | undefined): ReadonlySet<string> {
  const players = state?.players ?? [];
  const pawns = state?.pawns;
  return new Set(
    players.filter((p) => (p.place ?? -1) > -1 || allPawnsHome(pawns, p.id)).map((p) => p.id),
  );
}

/**
 * Sound effects (ported from the GWT AudioPlayer): a soft click when the turn passes to a new
 * player, and a fanfare when a player's race ends. Both fire on the TRANSITION, so this keeps the
 * previous push's turn and finishers — feed it every push.
 */
export class TransitionSounds {
  private prevCurrentPlayerId: string | undefined;
  /** Who had finished as of the previous push; undefined until the first push seeds it. */
  private prevFinished: ReadonlySet<string> | undefined;

  constructor(
    private readonly sound: SoundService,
    /**
     * How long the pawns still have to walk — the fanfare waits for it. The server reports the
     * finish in the same push that carries the winning move, so playing it straight away cheers a
     * pawn that is still crossing the board. It matters most for a 7-split, where the last pawn
     * home can be the second leg of the move: the win only becomes visible once BOTH legs land.
     */
    private readonly pawns: { remainingMs(): number } = { remainingMs: () => 0 },
  ) {}

  react(state: GameStatePush | undefined): void {
    const cur = state?.currentPlayerId;
    if (cur && this.prevCurrentPlayerId !== undefined && cur !== this.prevCurrentPlayerId) {
      this.sound.play('turnChange');
    }
    if (cur) this.prevCurrentPlayerId = cur;

    const finished = finishedPlayers(state);
    if (this.prevFinished && this.hasNewFinisher(finished)) {
      this.sound.play('medalAwarded', this.pawns.remainingMs());
    }
    this.prevFinished = finished;
  }

  /**
   * Whether anyone finished on this push. A yes/no rather than a count, so that a push which
   * finishes several players at once is still the single moment it reads as on the board.
   */
  private hasNewFinisher(finished: ReadonlySet<string>): boolean {
    const before = this.prevFinished;
    return before != null && [...finished].some((id) => !before.has(id));
  }
}
