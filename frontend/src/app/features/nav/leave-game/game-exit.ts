import { Injectable, inject } from '@angular/core';
import { PlayersService } from '../../../api';
import { Translations } from '../../../i18n/translations.service';
import { resolveGameSession } from '../../../session';

/**
 * Takes the player out of the game and back to the game room: DELETE them from the game
 * (leaveGame), then navigate away — on success or failure alike, as the GWT did. Used by the Leave
 * button and by the game-over panel.
 */
@Injectable({ providedIn: 'root' })
export class GameExit {
  private readonly players = inject(PlayersService);
  private readonly i18n = inject(Translations);
  private readonly session = resolveGameSession();

  leave(): void {
    const { sessionId, playerId } = this.session;
    if (!sessionId || !playerId) return;

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
