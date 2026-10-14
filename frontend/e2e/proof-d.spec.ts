import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame } from './support/seed';

// Proof D — proves the full bucket-D loop end to end:
//   seed a real game via the backend API → load the Angular app pointed at that
//   session → the app connects over SSE → the real backend's dealt hand + board
//   render in a real browser.
//
// This deliberately avoids animation timing (deterministic counts only). The
// blocked winner/medal + player-status UI is NOT built in Angular yet, so
// Winner2Players_IT can't be the target (see TEST_MIGRATION_CHECKLIST.md).

test('seeded 2-player game renders the dealt hand and board over SSE', async ({ page }) => {
  // Seed straight against the backend (not through the ng-serve proxy).
  const api = await request.newContext({ baseURL: API_URL });
  const { sessionId, playerIds } = await createGame(api, 2);

  // Load the Angular UI as player 0; it reads sessionid/playerid from the URL and
  // opens the SSE stream (proxied to the backend).
  await page.goto(`/?sessionid=${sessionId}&playerid=${playerIds[0]}`);

  // A standard deal gives player 0 five cards; a 2-player board has 24*2 tiles.
  await expect(page.locator('app-card.card:not(.flyer):not(.face-down)')).toHaveCount(5);
  await expect(page.locator('.tile')).toHaveCount(24 * 2);

  await api.dispose();
});
