import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameOver } from './game-over';
import { GameStore } from '../../game-store';
import { GameExit } from '../nav/leave-game/game-exit';
import { WINNER_BANNER_MS } from '../winner-banner/winner-banner';

describe('GameOver', () => {
  let fixture: ComponentFixture<GameOver>;
  let store: GameStore;
  const leave = vi.fn();
  const panel = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('[data-testid="game-over"]');

  beforeEach(async () => {
    vi.useFakeTimers();
    leave.mockReset();
    await TestBed.configureTestingModule({
      imports: [GameOver],
      providers: [{ provide: GameExit, useValue: { leave } }],
    }).compileComponents();
    fixture = TestBed.createComponent(GameOver);
    store = TestBed.inject(GameStore);
  });

  afterEach(() => vi.useRealTimers());

  // Nobody may be sent off without warning: the last winner gets their moment first, then the
  // panel says the game is over and counts down, and only at zero does the player leave.
  it('shows after the last winner is celebrated, then leaves when the 10 s countdown ends', () => {
    store.pawnsSettleMs.set(800);
    store.gameOver.set(true);
    fixture.detectChanges();

    vi.advanceTimersByTime(800 + WINNER_BANNER_MS - 1);
    fixture.detectChanges();
    expect(panel()).toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(panel()?.textContent).toContain('Back to the game room in 10 s');

    vi.advanceTimersByTime(9_000);
    fixture.detectChanges();
    expect(panel()?.textContent).toContain('Back to the game room in 1 s');
    expect(leave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
