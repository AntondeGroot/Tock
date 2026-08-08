import { Component, effect, inject, signal } from '@angular/core';
import { GameStore } from '../../game-store';
import { Translations } from '../../i18n/translations.service';
import { seatColor } from '../../player-colors';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface WinnerView {
  name: string;
  medal: string;
  color: string;
}

/**
 * A celebratory banner that pops when a player finishes (all pawns home). It
 * watches the store's `winners` list and announces each new finisher with their
 * medal, then auto-dismisses. Their standing also shows as a medal in the roster.
 */
@Component({
  selector: 'app-winner-banner',
  templateUrl: './winner-banner.html',
  styleUrl: './winner-banner.scss',
})
export class WinnerBanner {
  private readonly store = inject(GameStore);
  protected readonly i18n = inject(Translations);
  protected readonly current = signal<WinnerView | null>(null);

  // -1 until the first push; then the number of finishers we've already seen, so
  // joining a game that already has winners doesn't replay a stale banner.
  private seen = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const players = this.store.players();
      const winners = this.store.winners();

      // Arm only once the first real push has arrived (players populated) and adopt
      // whatever winners already exist silently — joining a game mid-way must not
      // replay a banner for someone who finished before you connected.
      if (this.seen < 0) {
        if (players.length > 0) this.seen = winners.length;
        return;
      }

      if (winners.length > this.seen) {
        // A team places as a PAIR — one push adds every member and they share a standing — so
        // announce all the newcomers, and take the medal from the standing the server gave them
        // rather than from the length of the list (which counts players, not places).
        const finishers = winners
          .slice(this.seen)
          .map((id) => players.find((p) => p.id === id))
          .filter((p) => p !== undefined);
        const place = finishers[0]?.place ?? winners.length; // `place` is optional in the API
        this.announce({
          name: finishers.map((p) => p.name ?? '').join(' + '),
          // Only the top three are medalled; the rest are still announced, just bare — the same
          // rule the roster's medal column follows, so a standing reads the same in both places.
          medal: MEDALS[place] ?? '',
          color: seatColor(finishers[0]?.playerInt),
        });
      }
      this.seen = winners.length;
    });
  }

  private announce(w: WinnerView): void {
    this.current.set(w);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), 4500);
  }

  protected dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}
