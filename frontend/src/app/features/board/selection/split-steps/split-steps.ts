import { Component, input, output } from '@angular/core';

/**
 * The 7-split step boxes: divide seven steps across the two selected pawns (the pair always sums
 * to seven, which the selection enforces). Each pawn gets a label, ± steppers and a number box,
 * tinted with that pawn's board highlight colour.
 *
 * Extracted from the board because the control needs a different PARENT per layout — tucked into
 * the button column on a desktop, a full-width row under the hand on a phone — which no amount of
 * CSS can express from one place in the DOM. Exactly one instance is ever rendered.
 */
@Component({
  selector: 'app-split-steps',
  templateUrl: './split-steps.html',
  styleUrl: './split-steps.scss',
})
export class SplitSteps {
  readonly steps1 = input<number>(0);
  readonly steps2 = input<number>(0);
  /** Each pawn's board-highlight colour, so the box matches the pawn it drives. */
  readonly color1 = input<string | undefined>(undefined);
  readonly color2 = input<string | undefined>(undefined);
  readonly label1 = input<string>('');
  readonly label2 = input<string>('');

  /** The requested step count, raw — the selection parses it and wraps 8 → 0 and −1 → 7. */
  readonly steps1Change = output<string>();
  readonly steps2Change = output<string>();

  protected step1(delta: number): void {
    this.steps1Change.emit(String(this.steps1() + delta));
  }
  protected step2(delta: number): void {
    this.steps2Change.emit(String(this.steps2() + delta));
  }
}
