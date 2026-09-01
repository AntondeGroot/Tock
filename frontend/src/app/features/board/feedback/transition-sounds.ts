import { GameStatePush } from '../../../api';
import { SoundService } from '../../../sound.service';

/**
 * Sound effects (ported from the GWT AudioPlayer): a soft click when the turn passes to a new
 * player, and a fanfare when a player finishes (gains a place). Both fire on the TRANSITION, so
 * this keeps the previous push's turn and medal count — feed it every push.
 */
export class TransitionSounds {
  private prevCurrentPlayerId: string | undefined;
  private prevMedalCount = -1;

  constructor(
    private readonly sound: SoundService,
    /**
     * How long the pawns still have to walk — the fanfare waits for it. The server awards the
     * place in the same push that carries the winning move, so playing it straight away cheers a
     * pawn that is still crossing the board. It matters most for a 7-split, where the finishing
     * pawn can be the second leg of the move: the win only becomes visible once BOTH legs land.
     */
    private readonly pawns: { remainingMs(): number } = { remainingMs: () => 0 },
  ) {}

  react(state: GameStatePush | undefined): void {
    const cur = state?.currentPlayerId;
    if (cur && this.prevCurrentPlayerId !== undefined && cur !== this.prevCurrentPlayerId) {
      this.sound.play('turnChange');
    }
    if (cur) this.prevCurrentPlayerId = cur;

    const medals = (state?.players ?? []).filter((p) => (p.place ?? -1) > -1).length;
    if (this.prevMedalCount >= 0 && medals > this.prevMedalCount) {
      this.sound.play('medalAwarded', this.pawns.remainingMs());
    }
    this.prevMedalCount = medals;
  }
}
