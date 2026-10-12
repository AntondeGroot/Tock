import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameRules } from './game-rules';
import { GameStore } from '../../../game-store';
import { Translations } from '../../../i18n/translations.service';

describe('GameRules', () => {
  let fixture: ComponentFixture<GameRules>;
  let store: GameStore;
  let i18n: Translations;
  const ruleTexts = (): string[] =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('.rules-row-text')].map((el) =>
      el.textContent!.trim(),
    );
  const openRules = () => {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.rulesButton')!
      .click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GameRules] }).compileComponents();
    fixture = TestBed.createComponent(GameRules);
    store = TestBed.inject(GameStore);
    i18n = TestBed.inject(Translations);
  });

  // The game option flips what happens at a blockade: by default a pawn turns around and walks its
  // remaining steps back, but with exact moves on, that same move is refused. The rules have to
  // describe the game actually being played, or they explain away the server's rejections.
  it('explains the rule of the game being played: bounce back, or exact moves', () => {
    // GIVEN a game played without exact moves
    store.exactMoveRequired.set(false);

    // WHEN the rules are opened
    openRules();

    // THEN they explain bouncing back, and say nothing about exact moves
    expect(ruleTexts()).toContain(i18n.t('rulesBounceBack'));
    expect(ruleTexts()).not.toContain(i18n.t('rulesExactMoves'));

    // WHEN the game turns out to require exact moves
    store.exactMoveRequired.set(true);
    fixture.detectChanges();

    // THEN the rules explain that instead
    expect(ruleTexts()).toContain(i18n.t('rulesExactMoves'));
    expect(ruleTexts()).not.toContain(i18n.t('rulesBounceBack'));
  });
});
