import { Component, computed, inject } from '@angular/core';
import { GameStore } from '../../game-store';
import { Player } from '../../api';
import { seatColor } from '../../player-colors';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// teamId is set by the backend only in team games (0-based, opposite-seat pairs);
// null otherwise, so team mode lights up on its own when teams are on.
function teamOf(p: Player): number | null {
  return p.teamId ?? null;
}
function teamLetter(t: number | null): string {
  return t == null ? '' : String.fromCharCode(65 + t);
}

interface Chip {
  id: string;
  name: string;
  color: string;
  isPlaying: boolean;
  isActive: boolean;
  medal: string;
  team: string | null;
  avatar: string | null;
  initial: string;
}

/**
 * The roster of players — a scoreboard strip in turn order (a port of the GWT
 * player list). Each chip shows the player's lobby avatar ringed in their in-game
 * colour, their name, and their state: gold dot when it's their turn, a medal when
 * they've finished, dimmed + struck through when they've left. In team games each
 * chip gets an A/B tag and a "Team A: … & …" summary sits on top.
 */
@Component({
  selector: 'app-player-list',
  templateUrl: './player-list.html',
  styleUrl: './player-list.scss',
})
export class PlayerList {
  private readonly store = inject(GameStore);

  private readonly view = computed(() => {
    // Sort by seat/turn order so the strip always reads in the order of play. The empty seats of
    // a widened board are not players — they belong to the board, not to the roster.
    const players = this.store
      .players()
      .filter((p) => p.placeholder !== true)
      .sort((a, b) => (a.playerInt ?? 0) - (b.playerInt ?? 0));
    const teamsOn = players.some((p) => teamOf(p) != null);

    const chips: Chip[] = players.map((p, i) => ({
      id: p.id ?? String(i),
      name: p.name ?? '',
      color: seatColor(p.playerInt),
      isPlaying: p.isPlaying === true,
      isActive: p.isActive !== false,
      medal: MEDALS[p.place ?? -1] ?? '',
      team: teamsOn ? teamLetter(teamOf(p)) : null,
      // Profile pics are served by GameRoom at the site ROOT (nginx `location /` → :4100),
      // not by the Keezen backend — so this is a root-absolute URL, NOT basePath-prefixed
      // (a /keezen/… URL would hit the Keezen backend, which has no profile-pic endpoint).
      avatar: p.profilePic ? `/profile-pic/${p.profilePic}` : null,
      initial: (p.name?.trim()?.[0] ?? '?').toUpperCase(),
    }));

    // One summary line per team, members in seat order.
    const teams = teamsOn
      ? [...new Set(chips.map((c) => c.team))]
          .filter((t): t is string => !!t)
          .sort((a, b) => a.localeCompare(b))
          .map((t) => ({ team: t, names: chips.filter((c) => c.team === t).map((c) => c.name) }))
      : [];

    return { chips, teams };
  });

  protected readonly chips = computed(() => this.view().chips);
  protected readonly teams = computed(() => this.view().teams);

  /** Hide a broken profile picture so the colour-ringed initial shows instead. */
  protected onAvatarError(ev: Event): void {
    (ev.target as HTMLElement).style.display = 'none';
  }
}
