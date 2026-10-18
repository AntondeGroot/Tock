import { test, expect } from '@playwright/test';
import { setOnlyCard } from './support/seed';
import { openBoard, handCard, handCards } from './support/steps';

// Rewrite of CardAnimation_IT: a card selected without a pawn is an invalid move,
// so it must not leave the hand. GWT let the click through and relied on the
// server rejecting it; Angular disables Play until the move is valid — either way
// the card stays put.

test.describe('card animation (CardAnimation_IT)', () => {
  test('a card selected with no pawn cannot be played and stays in hand', async ({ browser }) => {
    const { page } = await openBoard(browser, {
      setup: (api, s) => setOnlyCard(api, s, 'player0', 5),
    });
    await expect(handCards(page)).toHaveCount(1);

    await handCard(page, 5).dispatchEvent('click');

    // No pawn → not a legal move → Play is disabled and the card is still there.
    await expect(page.locator('.send-button')).toBeDisabled();
    await expect(handCards(page)).toHaveCount(1);
    await page.context().close();
  });
});
