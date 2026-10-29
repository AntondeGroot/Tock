import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GameStore } from '../../game-store';
import { Player } from '../../api';
import { seatColor } from '../../player-colors';
import { Translations } from '../../i18n/translations.service';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// teamId is set by the backend only in team games (0-based, opposite-seat pairs);
// null otherwise, so team mode lights up on its own when teams are on.
function teamOf(p: Player): number | null {
  return p.teamId ?? null;
}
function teamLetter(t: number): string {
  return String.fromCharCode(65 + t);
}

/** One row per team, in team order; each row's members in seat order. */
function teamRows(chips: Chip[]): TeamRow[] {
  const teamIds = [...new Set(chips.map((c) => c.teamId))].filter((t): t is number => t != null);
  teamIds.sort((a, b) => a - b);
  return teamIds.map((t) => ({
    colorKey: teamLetter(t),
    members: chips.filter((c) => c.teamId === t),
  }));
}

interface Chip {
  id: string;
  teamId: number | null;
  name: string;
  color: string;
  isPlaying: boolean;
  isActive: boolean;
  medal: string;
  avatar: string | null;
  initial: string;
}

/** One team's row in the roster: its members in seat order, outlined in the team colour. */
interface TeamRow {
  /** Picks the team colour (A–D); never shown — the colour itself says which team it is. */
  colorKey: string;
  members: Chip[];
}

/**
 * The roster of players — a scoreboard strip in turn order (a port of the GWT
 * player list). Each chip shows the player's lobby avatar ringed in their in-game
 * colour, their name, and their state: gold dot when it's their turn, a medal when
 * they've finished, dimmed + struck through when they've left. In team games the
 * chips are grouped under a "Teams" heading instead: one row per team, outlined in
 * the team colour (the colour the team's pawn pennants carry).
 */
@Component({
  selector: 'app-player-list',
  imports: [NgTemplateOutlet],
  templateUrl: './player-list.html',
  styleUrl: './player-list.scss',
})
export class PlayerList {
  private readonly store = inject(GameStore);
  protected readonly i18n = inject(Translations);

  private readonly view = computed(() => {
    // Sort by seat/turn order so the strip always reads in the order of play. The empty seats of
    // a widened board are not players — they belong to the board, not to the roster.
    const players = this.store
      .players()
      .filter((p) => p.placeholder !== true)
      .sort((a, b) => (a.playerInt ?? 0) - (b.playerInt ?? 0));
    const chips: Chip[] = players.map((p, i) => ({
      id: p.id ?? String(i),
      teamId: teamOf(p),
      name: p.name ?? '',
      color: seatColor(p.playerInt),
      isPlaying: p.isPlaying === true,
      isActive: p.isActive !== false,
      medal: MEDALS[p.place ?? -1] ?? '',
      // Profile pics are served by GameRoom at the site ROOT (nginx `location /` → :4100),
      // not by the Keezen backend — so this is a root-absolute URL, NOT basePath-prefixed
      // (a /keezen/… URL would hit the Keezen backend, which has no profile-pic endpoint).
      avatar: p.profilePic ? `/profile-pic/${p.profilePic}` : null,
      initial: (p.name?.trim()?.[0] ?? '?').toUpperCase(),
    }));

    return { chips, teams: teamRows(chips) };
  });

  protected readonly chips = computed(() => this.view().chips);
  /** The team rows — empty outside a team game, where the chips show as one plain grid. */
  protected readonly teams = computed(() => this.view().teams);
  /** A big table: on a phone the roster packs four players per row, leaving the board more room. */
  protected readonly compact = this.store.bigTable;

  /** Hide a broken profile picture so the colour-ringed initial shows instead. */
  protected onAvatarError(ev: Event): void {
    (ev.target as HTMLElement).style.display = 'none';
  }
}
