import { Injectable, signal } from '@angular/core';
import { readCookie, writeCookie } from '../../cookies';

/** '0' when the player turned the hints off; absent or '1' shows them. */
const SHOW_COOKIE = 'cardHints';
/** Set once the player chose for themselves, in Settings or by answering the question. */
const DECIDED_COOKIE = 'cardHintsDecided';
/** How many different games this browser has entered, and the last one counted. */
const GAMES_COOKIE = 'gamesEntered';
const LAST_GAME_COOKIE = 'lastGameEntered';

/** Two games in, the rules are known: entering the third is when to ask. */
const GAMES_BEFORE_ASKING = 2;

/**
 * Whether the hint under the hand explains the special cards. Players who know the rules can turn
 * it off, which leaves more room for the board — on a phone that space matters. Players who never
 * look for the setting are asked once, as they start their third game.
 */
@Injectable({ providedIn: 'root' })
export class CardHints {
  readonly visible = signal(readCookie(SHOW_COOKIE) !== '0');

  /** The player's own choice: remembered, and the question is never asked after it. */
  setVisible(visible: boolean): void {
    this.visible.set(visible);
    writeCookie(SHOW_COOKIE, visible ? '1' : '0');
    writeCookie(DECIDED_COOKIE, '1');
  }

  /**
   * Counts the game being entered — once per game, so refreshing the page doesn't count — and
   * says whether this is the moment to ask if the hints are still needed.
   */
  enterGame(sessionId: string): boolean {
    const gamesEntered = this.countGame(sessionId);
    const decided = readCookie(DECIDED_COOKIE) !== null;
    return this.visible() && !decided && gamesEntered > GAMES_BEFORE_ASKING;
  }

  private countGame(sessionId: string): number {
    const counted = Number(readCookie(GAMES_COOKIE)) || 0;
    if (readCookie(LAST_GAME_COOKIE) === sessionId) return counted;

    writeCookie(GAMES_COOKIE, String(counted + 1));
    writeCookie(LAST_GAME_COOKIE, sessionId);
    return counted + 1;
  }
}
