import { test, expect } from '@playwright/test';
import { setOnlyCard } from './support/seed';
import { openBoard, clickPawn, handCard } from './support/steps';

// The Keezen rule: with the `mustPlayIfPossible` game option on, if you have a
// legal move you must play it — you cannot forfeit. So the Forfeit button is
// disabled whenever a move is available, and Play is the only (green) action.
// Only when nothing can be played may you forfeit.

const MUST_PLAY = { mustPlayIfPossible: true };

test.describe('must-play rule — Forfeit gating', () => {
  test('with a legal move you must play: Forfeit disabled, Play turns green', async ({
    browser,
  }) => {
    // An Ace can take a nest pawn onto the board → player0 has a legal move.
    const { page } = await openBoard(browser, {
      gameOptions: MUST_PLAY,
      setup: (api, s) => setOnlyCard(api, s, 'player0', 1),
    });

    await expect(page.locator('.forfeit-button')).toBeDisabled();

    // Selecting the Ace + a pawn makes the move legal → Play is enabled and green.
    await handCard(page, 1).dispatchEvent('click');
    await clickPawn(page, 'player0:0');

    const play = page.locator('.send-button');
    await expect(play).toBeEnabled();
    const bg = await play.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg, 'Play should show the enabled green gradient').toContain('96, 212, 88'); // #60d458
    await page.context().close();
  });

  test('with no legal move you may forfeit even under must-play: Forfeit enabled', async ({
    browser,
  }) => {
    // A 5 cannot move any pawn out of the nest → no legal move → forfeit allowed.
    const { page } = await openBoard(browser, {
      gameOptions: MUST_PLAY,
      setup: (api, s) => setOnlyCard(api, s, 'player0', 5),
    });
    await expect(page.locator('.forfeit-button')).toBeEnabled();
    await page.context().close();
  });
});
