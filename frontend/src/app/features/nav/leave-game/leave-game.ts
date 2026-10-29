import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Translations } from '../../../i18n/translations.service';
import { resolveGameSession } from '../../../session';
import { GameExit } from './game-exit';

/**
 * Leave game button (fixed top-left; a red plaque on desktop, a red exit-icon on
 * mobile), ported from the GWT leaveGameButton. Opens a themed confirm dialog,
 * then leaves the game and returns to the game room (see GameExit).
 */
@Component({
  selector: 'app-leave-game',
  templateUrl: './leave-game.html',
  styleUrl: './leave-game.scss',
})
export class LeaveGame implements OnInit, OnDestroy {
  protected readonly i18n = inject(Translations);
  private readonly exit = inject(GameExit);
  private readonly session = resolveGameSession();

  /** Only shown while actually in a game. */
  protected readonly inGame = !!(this.session.sessionId && this.session.playerId);

  /** Whether the "Leave game?" confirm dialog is open. */
  protected readonly confirming = signal(false);

  /**
   * The browser's Back button must not drop you out of a running game without asking — it gets the
   * same confirm dialog as the Leave button. There is no router to guard, so this rides the History
   * API: a sentinel entry is pushed on top of the game page, and popping it (Back) pushes it
   * straight back — keeping us on the page — and opens the dialog. Cancelling therefore leaves the
   * guard armed for the next Back; confirming leaves for real via confirmLeave().
   */
  private readonly onPopState = (): void => {
    this.armBackGuard();
    this.ask();
  };

  ngOnInit(): void {
    if (!this.inGame) return;
    this.armBackGuard();
    window.addEventListener('popstate', this.onPopState);
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.onPopState);
  }

  private armBackGuard(): void {
    history.pushState({ keezenBackGuard: true }, '', location.href);
  }

  protected ask(): void {
    this.confirming.set(true);
  }

  protected cancel(): void {
    this.confirming.set(false);
  }

  protected confirmLeave(): void {
    this.confirming.set(false);
    this.exit.leave();
  }
}
