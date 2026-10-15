import { test, expect } from '@playwright/test';
import { setOnlyCard, setPawn } from './support/seed';
import { openBoard, clickPawn, pawnCentre, waitPawnSettled, dist } from './support/steps';

// Rewrite of CardSevenSplit_IT: the step-box/model desync regression. After the
// user edits the split steps, re-selecting the 7 must snap the boxes back to the
// model defaults — not leave the stale user values on screen while the model has
// reset (which caused the send button to play the wrong split).

test.describe('7-split step boxes (CardSevenSplit_IT)', () => {
  test('re-selecting the 7 resets the split step boxes to their defaults', async ({ browser }) => {
    const { page } = await openBoard(browser, {
      setup: async (api, s) => {
        await setPawn(api, s, 'player0', 0, 'player0', 1);
        await setPawn(api, s, 'player0', 1, 'player0', 2);
        await setOnlyCard(api, s, 'player0', 7);
      },
    });

    const card7 = page.getByTestId('card-7');
    const box1 = page.locator('.pawn-steps__input').first();
    const box2 = page.locator('.pawn-steps__input').nth(1);

    // Select 7 + both pawns → the split step boxes appear at the model default.
    await card7.dispatchEvent('click');
    await clickPawn(page, 'player0:0');
    await clickPawn(page, 'player0:1');
    await expect(box1).toBeVisible();

    const d1 = await box1.inputValue();
    const d2 = await box2.inputValue();
    expect(Number(d1) + Number(d2)).toBe(7); // a 7-split always totals 7

    // The user changes step 1 → step 2 recomputes; the boxes now differ from default.
    await box1.fill('3');
    await box1.blur();
    await expect(box1).toHaveValue('3');
    await expect(box2).toHaveValue('4');

    // Re-select the 7 (deselect, then select) → the boxes snap back to the default.
    await card7.dispatchEvent('click');
    await card7.dispatchEvent('click');
    await expect(box1).toHaveValue(d1);
    await expect(box2).toHaveValue(d2);
    await page.context().close();
  });
});

// Playing a full 7-split through the UI — the flow CardSevenSplit_IT never exercised
// (it only checked the step-box reset). Guards the two bugs where a played 7 lingered:
// after the split the 7 must be gone from the hand, on the pile, and no longer selectable.
test.describe('playing a 7-split', () => {
  test('splits across both pawns, then the 7 leaves the hand and can’t be re-selected', async ({
    browser,
  }) => {
    const { page } = await openBoard(browser, {
      setup: async (api, s) => {
        await setPawn(api, s, 'player0', 0, 'player0', 1);
        await setPawn(api, s, 'player0', 1, 'player0', 2);
        await setOnlyCard(api, s, 'player0', 7);
      },
    });

    const before0 = await pawnCentre(page, 'player0:0');
    const before1 = await pawnCentre(page, 'player0:1');

    // Select the 7 + both pawns, allocate 3/4, and play.
    await page.getByTestId('card-7').dispatchEvent('click');
    await clickPawn(page, 'player0:0');
    await clickPawn(page, 'player0:1');
    const box1 = page.locator('.pawn-steps__input').first();
    const box2 = page.locator('.pawn-steps__input').nth(1);
    await box1.fill('3');
    await box1.blur();
    await expect(box2).toHaveValue('4'); // the split always totals 7

    const play = page.locator('.send-button');
    await expect(play).toBeEnabled();
    await play.click();

    // Both pawns move to their split destinations (3 and 4 steps).
    const after0 = await waitPawnSettled(page, 'player0:0');
    const after1 = await waitPawnSettled(page, 'player0:1');
    expect(dist(before0, after0), 'pawn 0 should have moved').toBeGreaterThan(5);
    expect(dist(before1, after1), 'pawn 1 should have moved').toBeGreaterThan(5);

    // The 7 is consumed: no longer a playable hand card, now resting on the pile.
    await expect(
      page.locator('ct-card.card:not(.played):not(.flyer)[data-testid="card-7"]'),
    ).toHaveCount(0);
    expect(
      await page.locator('ct-card.card.played[data-testid="card-7"]').count(),
      'the played 7 should be on the pile',
    ).toBeGreaterThan(0);

    // The bug: clicking a pawn must NOT auto-select the played 7 (it is on the pile, so
    // it is excluded from the selection hand) — nothing should end up selected.
    await clickPawn(page, 'player0:0');
    await expect(page.locator('ct-card.card.selected')).toHaveCount(0);

    await page.context().close();
  });
});
