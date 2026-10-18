import { Page, Browser, expect, request } from '@playwright/test';
import { API_URL } from '../../playwright.config';
import { createGame } from './seed';

const UI = 'http://localhost:4300';

export interface Viewport {
  width: number;
  height: number;
}

/** Open the board in a fresh browser context viewing the game as `playerId`. */
export async function viewAs(
  browser: Browser,
  sessionId: string,
  playerId: string,
  viewport?: Viewport,
): Promise<Page> {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.addCookies([{ name: 'playerid', value: playerId, url: UI }]);
  const page = await ctx.newPage();
  await page.goto(`/?sessionid=${sessionId}&playerid=${playerId}`);
  await page.waitForSelector('ct-card.card', { timeout: 30000 });
  return page;
}

/** Seed a fresh N-player game, run optional backend setup, open it as `as`. */
export async function openBoard(
  browser: Browser,
  opts: {
    players?: number;
    as?: string;
    viewport?: Viewport;
    gameOptions?: Record<string, unknown>;
    setup?: (
      api: Awaited<ReturnType<typeof request.newContext>>,
      sessionId: string,
    ) => Promise<void>;
  } = {},
): Promise<{ page: Page; sessionId: string }> {
  const as = opts.as ?? 'player0';
  const api = await request.newContext({ baseURL: API_URL });
  const { sessionId } = await createGame(api, opts.players ?? 3, opts.gameOptions);
  if (opts.setup) await opts.setup(api, sessionId);
  await api.dispose();
  const page = await viewAs(browser, sessionId, as, opts.viewport);
  return { page, sessionId };
}

// A small Steps DSL over the Angular board — the Playwright equivalent of the GWT
// IntegrationTests `Steps`/`TestUtils` helpers, driving moves through the real UI
// (select card → select pawn(s) → Play card) and reading pawn positions.

export interface Pt {
  x: number;
  y: number;
}

/** Centre of a pawn on screen, by its `{playerId}:{pawnNr}` id. */
export async function pawnCentre(page: Page, id: string): Promise<Pt> {
  const box = await page.getByTestId(`pawn-${id}`).boundingBox();
  if (!box) throw new Error(`pawn ${id} not found`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Click a pawn (dispatchEvent so clustered nest pawns still get the exact one). */
export async function clickPawn(page: Page, id: string): Promise<void> {
  await page.getByTestId(`pawn-${id}`).dispatchEvent('click');
}

/** Hand cards currently in the viewer's hand (not flown to the pile). */
export function handCards(page: Page) {
  return page.locator('ct-card.card:not(.played):not(.flyer):not(.face-down)');
}

/**
 * The viewer's hand card of `value`. Scoped to the hand: a card of the same value can lie on the
 * pile too — seeding a hand forfeits the dealt one, and a refresh lays that out as the pile.
 */
export function handCard(page: Page, value: number) {
  return handCards(page).and(page.getByTestId(`card-${value}`));
}

/** Cards resting on the central pile (played / forfeited). */
export function pileCards(page: Page) {
  return page.locator('ct-card.card.played');
}

/** Forfeit the viewer's hand (click the Forfeit button). */
export async function forfeit(page: Page): Promise<void> {
  await page.locator('.forfeit-button').click();
}

/**
 * A roster chip's turn/inactive state, by player id — the Angular equivalent of
 * GWT's `playerPlaying playerActive` / `playerNotPlaying playerInactive` classes
 * (`chip--turn` ← isPlaying, `chip--inactive` ← !isActive). Used by the player-
 * status specs to watch the turn move around the roster over SSE.
 */
export async function chipState(
  page: Page,
  playerId: string,
): Promise<{ onTurn: boolean; inactive: boolean }> {
  const cls = (await page.getByTestId(`chip-${playerId}`).getAttribute('class')) ?? '';
  return { onTurn: cls.includes('chip--turn'), inactive: cls.includes('chip--inactive') };
}

/** A pawn is "selected" when the board sets its --pawn-highlight (pawn1/pawn2). */
export async function isPawnSelected(page: Page, id: string): Promise<boolean> {
  return page
    .getByTestId(`pawn-${id}`)
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--pawn-highlight').trim() !== '');
}

/**
 * Wait until a pawn stops moving (its centre is unchanged across two polls) —
 * the equivalent of the GWT `waitUntilPawnStopsMoving`.
 */
export async function waitPawnSettled(page: Page, id: string, timeout = 8000): Promise<Pt> {
  let prev: Pt | null = null;
  let stableReads = 0;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const now = await pawnCentre(page, id);
    if (prev && dist(prev, now) < 1) {
      if (++stableReads >= 2) return now;
    } else {
      stableReads = 0;
    }
    prev = now;
    await page.waitForTimeout(120);
  }
  return prev ?? (await pawnCentre(page, id));
}

/**
 * Play the hand card of `value` on the given pawn(s), then click Play card.
 * Uses dispatchEvent so overlapping nest pawns still receive the click reliably.
 */
export async function playCard(
  page: Page,
  opts: { value: number; pawns: string[] },
): Promise<void> {
  await handCard(page, opts.value).dispatchEvent('click');
  for (const id of opts.pawns) {
    await page.getByTestId(`pawn-${id}`).dispatchEvent('click');
  }
  const play = page.locator('.send-button');
  await expect(play).toBeEnabled();
  await play.click();
}
