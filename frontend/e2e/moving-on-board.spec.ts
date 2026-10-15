import { test, expect, request, Browser, Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame, setOnlyCard, setPawn } from './support/seed';
import { pawnCentre, waitPawnSettled, playCard, dist } from './support/steps';

// Rewrite of MovingOnBoard_IT: a pawn moves on the board when its player plays a
// card. The GWT test leaned on an ordered, shared session so each case ran as the
// next player in turn order; here each case is independent (fresh game, played as
// player0 whose turn it is) — same behaviours, no order coupling.

const UI = 'http://localhost:4300';

/** Seed a fresh 3-player game, run backend setup, then open the board as player0. */
async function openGame(
  browser: Browser,
  setup: (api: Awaited<ReturnType<typeof request.newContext>>, sessionId: string) => Promise<void>,
): Promise<Page> {
  const api = await request.newContext({ baseURL: API_URL });
  const { sessionId } = await createGame(api, 3);
  await setup(api, sessionId);
  await api.dispose();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'playerid', value: 'player0', url: UI }]);
  const page = await ctx.newPage();
  await page.goto(`/?sessionid=${sessionId}&playerid=player0`);
  await page.waitForSelector('ct-card.card', { timeout: 30000 });
  return page;
}

test.describe('moving on the board (MovingOnBoard_IT)', () => {
  test('a nest pawn moves onto the board with an Ace', async ({ browser }) => {
    const page = await openGame(browser, (api, s) => setOnlyCard(api, s, 'player0', 1));
    const before = await pawnCentre(page, 'player0:0');

    await playCard(page, { value: 1, pawns: ['player0:0'] });
    const after = await waitPawnSettled(page, 'player0:0');

    expect(dist(before, after)).toBeGreaterThan(5);
    await page.context().close();
  });

  test('a nest pawn moves onto the board with a King', async ({ browser }) => {
    const page = await openGame(browser, (api, s) => setOnlyCard(api, s, 'player0', 13));
    const before = await pawnCentre(page, 'player0:0');

    await playCard(page, { value: 13, pawns: ['player0:0'] });
    const after = await waitPawnSettled(page, 'player0:0');

    expect(dist(before, after)).toBeGreaterThan(5);
    await page.context().close();
  });

  test('a pawn already on the board moves forward with an Ace', async ({ browser }) => {
    const page = await openGame(browser, async (api, s) => {
      await setPawn(api, s, 'player0', 0, 'player0', 0); // pawn 0 on its start tile
      await setOnlyCard(api, s, 'player0', 1);
    });
    const before = await pawnCentre(page, 'player0:0');

    await playCard(page, { value: 1, pawns: ['player0:0'] });
    const after = await waitPawnSettled(page, 'player0:0');

    expect(dist(before, after)).toBeGreaterThan(5);
    await page.context().close();
  });

  test('a Jack switches two pawns on the board', async ({ browser }) => {
    const page = await openGame(browser, async (api, s) => {
      await setPawn(api, s, 'player0', 0, 'player0', 0); // own pawn on the board
      await setPawn(api, s, 'player2', 0, 'player2', 10); // an opponent pawn to swap with
      await setOnlyCard(api, s, 'player0', 11);
    });
    const ownBefore = await pawnCentre(page, 'player0:0');
    const foeBefore = await pawnCentre(page, 'player2:0');

    await playCard(page, { value: 11, pawns: ['player0:0', 'player2:0'] });
    const ownAfter = await waitPawnSettled(page, 'player0:0');
    const foeAfter = await pawnCentre(page, 'player2:0');

    // They traded tiles.
    expect(dist(ownAfter, foeBefore)).toBeLessThan(12);
    expect(dist(foeAfter, ownBefore)).toBeLessThan(12);
    await page.context().close();
  });
});
