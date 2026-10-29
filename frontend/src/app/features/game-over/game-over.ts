import { Component, computed, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { GameStore } from '../../game-store';
import { Translations } from '../../i18n/translations.service';
import { GameExit } from '../nav/leave-game/game-exit';
import { WINNER_BANNER_MS } from '../winner-banner/winner-banner';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** How long the panel counts down before it takes the player back to the game room. */
export const GAME_OVER_COUNTDOWN_S = 10;

/** One line of the final standings: a place and everyone who shares it (a team places as one). */
interface Standing {
  place: number;
  medal: string;
  names: string;
}

/**
 * The end of the game. Once nobody is left to play, the last winner first gets their moment (the
 * pawn lands, the banner runs); then this panel shows the final standings and counts down before
 * taking the player back to the game room. The button goes there at once. Nobody is sent away
 * without seeing why.
 */
@Component({
  selector: 'app-game-over',
  templateUrl: './game-over.html',
  styleUrl: './game-over.scss',
})
export class GameOver implements OnDestroy {
  private readonly store = inject(GameStore);
  private readonly exit = inject(GameExit);
  protected readonly i18n = inject(Translations);

  protected readonly open = signal(false);
  protected readonly secondsLeft = signal(GAME_OVER_COUNTDOWN_S);

  protected readonly standings = computed(() => standingsOf(this.store.players()));

  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => {
      if (!this.store.gameOver() || this.showTimer !== undefined) return;
      const celebrationMs = untracked(this.store.pawnsSettleMs) + WINNER_BANNER_MS;
      this.showTimer = setTimeout(() => this.show(), celebrationMs);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.showTimer);
    clearInterval(this.tick);
  }

  protected backToGameRoom(): void {
    clearInterval(this.tick);
    this.exit.leave();
  }

  private show(): void {
    this.open.set(true);
    this.tick = setInterval(() => {
      this.secondsLeft.update((s) => s - 1);
      if (this.secondsLeft() === 0) this.backToGameRoom();
    }, 1000);
  }
}

/** Everyone who finished, grouped by place, best first. Players who left earn no place. */
function standingsOf(players: { name?: string; place?: number }[]): Standing[] {
  const byPlace = new Map<number, string[]>();
  for (const p of players) {
    const place = p.place ?? -1;
    if (place < 1) continue;
    byPlace.set(place, [...(byPlace.get(place) ?? []), p.name ?? '']);
  }
  const places = [...byPlace.keys()];
  places.sort((a, b) => a - b);
  return places.map((place) => ({
    place,
    medal: MEDALS[place] ?? `${place}.`,
    names: byPlace.get(place)!.join(' + '),
  }));
}
