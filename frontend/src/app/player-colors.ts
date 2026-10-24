import { computed, signal } from '@angular/core';
import { readCookie, writeCookie } from './cookies';

/**
 * Player colours are a *frontend* concern. The backend only distinguishes players by a
 * stable `playerInt` — the seat index, identical for every viewer — so everyone sees the
 * same player as, say, red ("it's red's turn"). This maps that index to a colour.
 *
 * A player who finds two colours hard to tell apart can pick their own, per seat, in Settings.
 * Those choices are this browser's alone — the other players keep seeing their own colours.
 *
 * The palette matches the GWT client's PlayerColors, so colours are unchanged from before.
 */
const PALETTE = [
  '#A52A2A',
  '#1a6fbd',
  '#008000',
  '#A5A500',
  '#6A5ACD',
  '#FF8C00',
  '#008B8B',
  '#8B008B',
] as const;

const FALLBACK = '#8a8a8a';

const CHOSEN_COLORS_COOKIE = 'pawnColors';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The colours this player picked, by seat. A signal, so everything that colours a pawn, a tile or
 * a name — all through seatColor(), inside computeds and templates — follows a new pick at once.
 */
const chosenColors = signal<Partial<Record<number, string>>>(loadChosenColors());

/** Whether the player has picked any colour of their own (so there is something to undo). */
export const hasChosenColors = computed(() => Object.keys(chosenColors()).length > 0);

/** Colour for a player's seat index (`playerInt`); a neutral grey if it's missing. */
export function seatColor(playerInt: number | null | undefined): string {
  if (playerInt == null) return FALLBACK;
  return chosenColors()[playerInt] ?? PALETTE[playerInt] ?? FALLBACK;
}

/** Shows the seat in `color` from now on, in this game and the next. */
export function chooseSeatColor(playerInt: number, color: string): void {
  chosenColors.update((chosen) => ({ ...chosen, [playerInt]: color }));
  writeCookie(CHOSEN_COLORS_COOKIE, JSON.stringify(chosenColors()));
}

/** Back to the standard palette for every seat. */
export function resetSeatColors(): void {
  chosenColors.set({});
  writeCookie(CHOSEN_COLORS_COOKIE, '{}');
}

/** The saved picks, keeping only well-formed colours: a mangled cookie must not break the board. */
function loadChosenColors(): Partial<Record<number, string>> {
  try {
    const saved: unknown = JSON.parse(readCookie(CHOSEN_COLORS_COOKIE) ?? '{}');
    if (typeof saved !== 'object' || saved === null) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([, color]) => typeof color === 'string' && HEX_COLOR.test(color),
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Team accents for team play, keyed by 0-based `teamId`. Bold, well-spaced hues (with the
 * pennant's shape as a second, colour-independent cue) so teams stay distinguishable for
 * low-vision players. Kept light enough that the roster's dark tag text stays legible, and
 * mirrored in player-list.scss `--team-a…d` so a pawn's pennant and its team's scoreline
 * match. Undefined when the player has no team (teams off), so no pennant shows.
 */
const TEAM_PALETTE = ['#f0932a', '#4da3e8', '#35be83', '#ee7ab6'] as const; // orange, blue, green, pink

export function teamAccent(teamId: number | null | undefined): string | undefined {
  if (teamId == null) return undefined;
  return TEAM_PALETTE[teamId];
}
