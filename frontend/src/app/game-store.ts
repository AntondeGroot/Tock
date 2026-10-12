import { Injectable, signal } from '@angular/core';
import { Player } from './api';

/**
 * Small shared slice of game state so components outside the board (e.g. the
 * player list) can read it without re-subscribing to the SSE stream. The board
 * owns the connection and pushes the players here on every server update.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  /** Players from the latest server push: name, colour, turn/active flags, medal place. */
  readonly players = signal<Player[]>([]);

  /** Player ids in the order they finished (1st, 2nd, 3rd, …). */
  readonly winners = signal<string[]>([]);

  /**
   * How long the pawns of the latest push still have to walk. A finish arrives in the same push
   * as the winning move, so anything that celebrates it waits this long to match the board.
   */
  readonly pawnsSettleMs = signal(0);
}
