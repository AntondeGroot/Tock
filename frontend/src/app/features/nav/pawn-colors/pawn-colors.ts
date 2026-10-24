import { Component, computed, inject, output, signal } from '@angular/core';
import { Translations } from '../../../i18n/translations.service';
import { GameStore } from '../../../game-store';
import {
  chooseSeatColor,
  hasChosenColors,
  resetSeatColors,
  seatColor,
} from '../../../player-colors';
import { Pawn } from '../../board/pawn/pawn';
import { ColorWheel } from './color-wheel/color-wheel';

/** Seats shown when there is no game (yet) to take the players from. */
const SEATS_WITHOUT_A_GAME = 4;
/** More players than this, and the pawns take two columns so none is hidden below a scroll. */
const PAWNS_IN_ONE_COLUMN = 4;

interface Seat {
  playerInt: number;
  name: string;
}

/**
 * The pawn-colour screen in Settings: big pawns of every player down the left, a big colour wheel
 * on the right. Made for players who struggle with screens: one instruction, a pawn already
 * selected so the very first tap on the wheel does something, and the new colour shows at once —
 * on these pawns and on the board — with nothing to save.
 */
@Component({
  selector: 'app-pawn-colors',
  imports: [Pawn, ColorWheel],
  templateUrl: './pawn-colors.html',
  styleUrl: './pawn-colors.scss',
})
export class PawnColors {
  protected readonly i18n = inject(Translations);
  private readonly store = inject(GameStore);
  readonly done = output();

  protected readonly seatColor = seatColor;
  protected readonly hasChosenColors = hasChosenColors;
  protected readonly resetColors = resetSeatColors;

  /** The players in seat order — or numbered seats, outside a game. */
  protected readonly seats = computed<Seat[]>(() => {
    const players = this.store
      .players()
      .filter((p) => p.placeholder !== true && p.playerInt != null)
      .sort((a, b) => a.playerInt! - b.playerInt!);
    if (players.length) return players.map((p) => ({ playerInt: p.playerInt!, name: p.name }));
    return Array.from({ length: SEATS_WITHOUT_A_GAME }, (_, seat) => ({
      playerInt: seat,
      name: this.i18n.t('colorsPlayer', seat + 1),
    }));
  });

  protected readonly twoColumns = computed(() => this.seats().length > PAWNS_IN_ONE_COLUMN);

  private readonly chosenSeat = signal<number | null>(null);
  /** The seat the wheel paints: the one tapped last, or the first until then. */
  protected readonly selectedSeat = computed(
    () => this.chosenSeat() ?? this.seats()[0]?.playerInt ?? null,
  );

  protected select(seat: number): void {
    this.chosenSeat.set(seat);
  }

  protected paint(color: string): void {
    const seat = this.selectedSeat();
    if (seat != null) chooseSeatColor(seat, color);
  }
}
