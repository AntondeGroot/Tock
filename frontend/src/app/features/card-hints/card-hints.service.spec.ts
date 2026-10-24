import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CardHints } from './card-hints.service';

const COOKIES = ['cardHints', 'cardHintsDecided', 'gamesEntered', 'lastGameEntered'];

describe('CardHints', () => {
  afterEach(() => {
    for (const name of COOKIES) document.cookie = `${name}=; path=/; max-age=0`;
  });

  // Two games in, a player knows the special cards, so entering the third is when to ask whether
  // the hints are still needed. A refresh reopens the SAME game: counting it would ask a player
  // who has really only played twice.
  it('asks on entering the third different game, and a refresh does not count as a game', () => {
    const hints = TestBed.inject(CardHints);

    expect(hints.enterGame('game-1')).toBe(false);
    expect(hints.enterGame('game-2')).toBe(false);
    expect(hints.enterGame('game-2')).toBe(false); // the second game, refreshed

    expect(hints.enterGame('game-3')).toBe(true);
  });

  // The question is asked once. Whatever the player chose — keeping the hints when asked, or
  // turning them off in Settings before it ever came up — is their answer, and later games must
  // not ask again.
  it.each([
    ['kept the hints when asked', true],
    ['turned them off in Settings', false],
  ])('never asks again once the player %s', (_choice, visible) => {
    const hints = TestBed.inject(CardHints);
    hints.enterGame('game-1');
    hints.enterGame('game-2');

    hints.setVisible(visible);

    expect(hints.enterGame('game-3')).toBe(false);
    expect(hints.enterGame('game-4')).toBe(false);
  });

  // Hints are on until a player turns them off, and that choice has to outlive the page: the next
  // game — or a refresh of this one — starts a fresh app, which only knows what the cookie says.
  it('shows the hints by default, and remembers turning them off across a reload', () => {
    expect(TestBed.inject(CardHints).visible()).toBe(true);

    TestBed.inject(CardHints).setVisible(false);
    TestBed.resetTestingModule(); // the page reloads: a fresh app, a fresh CardHints

    expect(TestBed.inject(CardHints).visible()).toBe(false);
  });
});
