import { test, expect } from '@playwright/test';
import { setHand, setOnlyCard, setPawn } from './support/seed';
import { openBoard, playCard, viewAs, waitPawnSettled } from './support/steps';

// The team card-trade ("ask your teammate for a King/Ace") is only offerable until you play your
// first card of the round; a new deal reopens it. The rule lives in the backend (canRequestTrade)
// and the button mirrors it. Backend unit tests cover the rule; this asserts the end-to-end wiring.
test.describe('team card-trade window', () => {
  test('the ask button shows until you play your first card of the round', async ({ browser }) => {
    const { page } = await openBoard(browser, {
      players: 4,
      as: 'player0',
      gameOptions: { teamPlay: true, teamCardTrade: true },
      setup: async (api, s) => {
        await setPawn(api, s, 'player0', 0, 'player0', 5);
        await setOnlyCard(api, s, 'player0', 1); // a single Ace to play
      },
    });

    const askButton = page.locator('.ask-trade-button');
    await expect(askButton, 'trade window open before playing').toBeVisible();

    await playCard(page, { value: 1, pawns: ['player0:0'] });
    await waitPawnSettled(page, 'player0:0');

    await expect(askButton, 'trade window closed after the first play').toHaveCount(0);
    await page.context().close();
  });

  // The whole parley, both sides at once. Pressing the button asks there and then, so the teammate
  // is looking at the request before the requester has chosen anything — and can answer it right
  // away. Whichever half lands last completes the swap; here the teammate goes first.
  test('asking is immediate; the teammate can answer first, and the pair swaps', async ({
    browser,
  }) => {
    const { page: asker, sessionId } = await openBoard(browser, {
      players: 4,
      as: 'player0',
      gameOptions: { teamPlay: true, teamCardTrade: true },
      // The asker holds no King or Ace — that is why they are asking; the teammate holds both.
      setup: async (api, s) => {
        await setHand(api, s, 'player0', [2, 4, 6]);
        await setHand(api, s, 'player2', [1, 13, 5]);
      },
    });
    const mate = await viewAs(browser, sessionId, 'player2');

    await asker.click('.ask-trade-button');

    // The ask has already reached the teammate.
    const give = mate.locator('.trade-btn.primary');
    await expect(mate.locator('.trade-dialog')).toBeVisible();

    // The asker is told the ask is out, and their hand is beckoning rather than idle.
    await expect(asker.locator('.trade-hand.hinting')).toBeVisible();

    // The teammate can hand a King over straight away — no waiting on the asker.
    await mate.locator('[data-testid="trade-card-13"]').click();
    await expect(give, 'giving is not gated on the other half').toBeEnabled();
    await give.click();

    // Their half is held: the give is done, and now THEY are the ones waiting.
    await expect(give).toHaveCount(0);
    await expect(mate.locator('.trade-sub')).toContainText('Waiting for player0');
    await expect(
      asker.locator('app-card.card[data-testid="card-13"]'),
      'not swapped yet',
    ).toHaveCount(0);

    // Picking a card sends it — no confirm button anywhere in the picker — and completes the swap.
    await expect(asker.locator('.trade-btn.primary')).toHaveCount(0);
    await asker.locator('[data-testid="trade-card-4"]').click();

    // Both sides settle: the trade closes and the asker is holding the King.
    await expect(asker.locator('.trade-dialog')).toHaveCount(0);
    await expect(mate.locator('.trade-dialog')).toHaveCount(0);
    await expect(asker.locator('app-card.card[data-testid="card-13"]')).toBeVisible();
    await expect(mate.locator('app-card.card[data-testid="card-4"]')).toBeVisible();

    await asker.context().close();
    await mate.context().close();
  });

  // Their King is committed and the swap waits on the asker alone. Rather than leave a teammate
  // hanging, the asker gets ten seconds and then a card is chosen for them.
  test('a card is picked for you if you leave your teammate hanging', async ({ browser }) => {
    const { page: asker, sessionId } = await openBoard(browser, {
      players: 4,
      as: 'player0',
      gameOptions: { teamPlay: true, teamCardTrade: true },
      setup: async (api, s) => {
        await setHand(api, s, 'player0', [2, 4, 6]);
        await setHand(api, s, 'player2', [13, 5]);
      },
    });
    const mate = await viewAs(browser, sessionId, 'player2');

    await asker.click('.ask-trade-button');
    await mate.locator('[data-testid="trade-card-13"]').click();
    await mate.locator('.trade-btn.primary').click();

    // The asker is now on the clock: the ring is drawn and the count inside it runs down.
    const count = asker.locator('.countdown-number');
    await expect(asker.locator('.countdown-fill')).toBeVisible();
    await expect(count).toHaveText('10');
    await expect(count).toHaveText('7', { timeout: 8_000 });

    // Left alone, it resolves itself: the swap goes through and the asker holds the King.
    await expect(asker.locator('.trade-dialog'), 'the trade settles itself').toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(asker.locator('app-card.card[data-testid="card-13"]')).toBeVisible();
    // …and one of the asker's three cards left their hand for the teammate.
    await expect(asker.locator('app-card.card:not(.flyer)')).toHaveCount(3);

    await asker.context().close();
    await mate.context().close();
  });
});
