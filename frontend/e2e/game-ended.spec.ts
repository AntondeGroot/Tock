import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { openBoard } from './support/steps';

// The host can end a game from the game room while everyone is still playing: the game room
// deletes the game. The whole chain is checked here, against the real backend: the server tells
// each open board, and the board says so instead of freezing or reconnecting forever.

test('a game ended by the host tells the board, which says so', async ({ browser }) => {
  const { page, sessionId } = await openBoard(browser);

  // WHEN the game is stopped, as the game room does when the host ends it
  const api = await request.newContext({ baseURL: API_URL });
  expect((await api.delete(`/games/${sessionId}`)).status()).toBe(204);
  await api.dispose();

  // THEN the board says the game was ended, and counts down to the game room
  const panel = page.getByTestId('game-over');
  await expect(panel).toContainText('The game has been ended', { timeout: 5000 });
  await expect(panel).toContainText('Back to the game room in');
  await page.context().close();
});
