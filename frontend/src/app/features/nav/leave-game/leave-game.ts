import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { PlayersService } from '../../../api';
import { Translations } from '../../../i18n/translations.service';
import { resolveGameSession } from '../../../session';

/**
 * Leave game button (fixed top-left; a red plaque on desktop, a red exit-icon on
 * mobile), ported from the GWT leaveGameButton. Opens a themed confirm dialog,
 * then DELETEs the player from the game (leaveGame) and navigates away — matching
 * the GWT, which redirects on success or failure alike.
 */
@Component({
  selector: 'app-leave-game',
  templateUrl: './leave-game.html',
  styleUrl: './leave-game.scss',
})
export class LeaveGame implements OnInit, OnDestroy {
  protected readonly i18n = inject(Translations);
  private readonly players = inject(PlayersService);
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
    const { sessionId, playerId } = this.session;
    if (!sessionId || !playerId) return;

    // Leave, then return to the game room whether or not the call succeeds (GWT parity).
    const done = () => (window.location.href = this.gameRoomUrl());
    this.players.leaveGame(sessionId, playerId).subscribe({ next: done, error: done });
  }

  /**
   * Ported from the GWT buildGameRoomUrl(): the GameRoom lives at the host root
   * (no port), and a `roomid` URL param carries the room to return to.
   */
  private gameRoomUrl(): string {
    const base = `${window.location.protocol}//${window.location.hostname}`;
    const roomId = new URLSearchParams(window.location.search).get('roomid');
    return roomId ? `${base}/?locale=${this.i18n.locale()}#room=${roomId}` : base;
  }
}
