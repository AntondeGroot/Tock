import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PawnColors } from './pawn-colors';
import { ColorWheel } from './color-wheel/color-wheel';
import { GameStore } from '../../../game-store';
import { resetSeatColors, seatColor } from '../../../player-colors';

describe('PawnColors', () => {
  let fixture: ComponentFixture<PawnColors>;
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  /** A tap on the wheel, as the wheel reports it: the colour under the finger. */
  const tapWheel = (color: string) => {
    fixture.debugElement.query(By.directive(ColorWheel)).componentInstance.picked.emit(color);
    fixture.detectChanges();
  };
  const tapPawnOf = (name: string) => {
    const pawns = [...element().querySelectorAll<HTMLButtonElement>('.colors-pawn')];
    pawns.find((pawn) => pawn.textContent!.includes(name))!.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PawnColors] }).compileComponents();
    TestBed.inject(GameStore).players.set([
      { id: 'b', name: 'Mum', playerInt: 1 },
      { id: 'a', name: 'Dad', playerInt: 0 },
    ]);
    fixture = TestBed.createComponent(PawnColors);
    fixture.detectChanges();
  });

  afterEach(() => {
    resetSeatColors();
    document.cookie = 'pawnColors=; path=/; max-age=0';
  });

  // A player who doesn't know where to start must not be able to tap the wheel for nothing: the
  // first pawn is selected from the start, so the very first tap colours it. After that, the pawn
  // tapped last is the one the wheel paints — and only that one.
  it('colours the first pawn from the very first tap, then whichever pawn was tapped', () => {
    tapWheel('#00ff00');
    expect(seatColor(0)).toBe('#00ff00'); // Dad sits first, so he is the one selected

    tapPawnOf('Mum');
    tapWheel('#ff00aa');
    expect(seatColor(1)).toBe('#ff00aa');
    expect(seatColor(0)).toBe('#00ff00'); // Dad keeps his
  });
});
