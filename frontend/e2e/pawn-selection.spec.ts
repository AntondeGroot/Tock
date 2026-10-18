import { test, expect, request, Browser, Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame, setOnlyCard } from './support/seed';
import {
  clickPawn,
  handCard,
  isPawnSelected,
  viewAs,
  forfeit,
  playCard,
  pawnCentre,
  waitPawnSettled,
  dist,
} from './support/steps';

// Rewrite of Pawn_IT's selection cases: clicking a pawn highlights it, a second
// own pawn steals the selection, and an opponent's pawn cannot be selected.

const UI = 'http://localhost:4300';

async function openGame(browser: Browser): Promise<Page> {
  const api = await request.newContext({ baseURL: API_URL });
  const { sessionId } = await createGame(api, 3);
  await api.dispose();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'playerid', value: 'player0', url: UI }]);
  const page = await ctx.newPage();
  await page.goto(`/?sessionid=${sessionId}&playerid=player0`);
  await page.waitForSelector('ct-card.card', { timeout: 30000 });
  return page;
}

test.describe('pawn selection (Pawn_IT)', () => {
  test('clicking your own pawn selects it', async ({ browser }) => {
    const page = await openGame(browser);
    await clickPawn(page, 'player0:0');
    await expect.poll(() => isPawnSelected(page, 'player0:0')).toBe(true);
    await page.context().close();
  });

  test('selecting a second own pawn deselects the first', async ({ browser }) => {
    // Select an explicit Ace first (a 1-pawn card). Without a card, clicking a pawn
    // auto-selects one via an async round-trip, and a 7/Jack would allow keeping
    // TWO pawns — which made this assertion race and flake in CI. With the Ace
    // chosen, exactly one pawn can be selected, so the second replaces the first.
    const api = await request.newContext({ baseURL: API_URL });
    const { sessionId } = await createGame(api, 3);
    await setOnlyCard(api, sessionId, 'player0', 1);
    await api.dispose();
    const page = await viewAs(browser, sessionId, 'player0');

    await handCard(page, 1).dispatchEvent('click');
    await clickPawn(page, 'player0:0');
    await expect.poll(() => isPawnSelected(page, 'player0:0')).toBe(true);

    await clickPawn(page, 'player0:1');
    await expect.poll(() => isPawnSelected(page, 'player0:1')).toBe(true);
    await expect.poll(() => isPawnSelected(page, 'player0:0')).toBe(false);
    await page.context().close();
  });

  test("an opponent's pawn cannot be selected", async ({ browser }) => {
    const page = await openGame(browser);
    // Click an own pawn first as a control, then the opponent's; only the own one selects.
    await clickPawn(page, 'player0:0');
    await clickPawn(page, 'player1:1');
    await expect.poll(() => isPawnSelected(page, 'player0:0')).toBe(true);
    expect(await isPawnSelected(page, 'player1:1')).toBe(false);
    await page.context().close();
  });

  // Pawn_IT case 4: after the players ahead forfeit (they have no legal move), the
  // next player can move over SSE without a page reload.
  test('after two players forfeit, the third can still move on the board', async ({ browser }) => {
    const api = await request.newContext({ baseURL: API_URL });
    const { sessionId } = await createGame(api, 3);
    await setOnlyCard(api, sessionId, 'player0', 5); // no legal move (all pawns nested) → may forfeit
    await setOnlyCard(api, sessionId, 'player1', 5);
    await setOnlyCard(api, sessionId, 'player2', 1); // an Ace → can move onto the board
    await api.dispose();

    const p0 = await viewAs(browser, sessionId, 'player0');
    await forfeit(p0);
    await p0.context().close();

    const p1 = await viewAs(browser, sessionId, 'player1');
    await forfeit(p1);
    await p1.context().close();

    const p2 = await viewAs(browser, sessionId, 'player2');
    const before = await pawnCentre(p2, 'player2:0');
    await playCard(p2, { value: 1, pawns: ['player2:0'] });
    const after = await waitPawnSettled(p2, 'player2:0');
    expect(dist(before, after)).toBeGreaterThan(5);
    await p2.context().close();
  });
});
