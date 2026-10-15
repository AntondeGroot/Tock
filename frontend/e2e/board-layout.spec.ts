import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame } from './support/seed';

// Board layout must hold for 2/3/4 players on desktop AND mobile:
//   1. opponents' card backs never spill into the title row,
//   2. opponents' card backs stay within the viewport (side seats on narrow
//      mobile used to overflow the left/right edges),
//   3. the viewer's hand cards never overlap the board tiles (the card layer
//      must stay aligned with the board).

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
const PLAYER_COUNTS = [2, 3, 4];

type Box = { top: number; right: number; bottom: number; left: number };
const overlaps = (a: Box, b: Box, T = 1) =>
  !(
    a.right <= b.left + T ||
    a.left >= b.right - T ||
    a.bottom <= b.top + T ||
    a.top >= b.bottom - T
  );

test.describe('board layout: cards vs. title / viewport / tiles', () => {
  const sessions: Record<number, string> = {};

  test.beforeAll(async () => {
    const api = await request.newContext({ baseURL: API_URL });
    for (const n of PLAYER_COUNTS) {
      const { sessionId } = await createGame(api, n);
      sessions[n] = sessionId;
    }
    await api.dispose();
  });

  for (const vp of VIEWPORTS) {
    for (const n of PLAYER_COUNTS) {
      test(`${vp.name} · ${n} players`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctx.addCookies([
          { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
        ]);
        const page = await ctx.newPage();
        await page.goto(`/?sessionid=${sessions[n]}&playerid=player0`);
        await page.waitForSelector('ct-card.card.face-down', { timeout: 30000 });
        await page.waitForSelector('ct-card.card:not(.flyer)', { timeout: 30000 });

        const g = await page.evaluate(() => {
          const rj = (el: Element) => el.getBoundingClientRect().toJSON();
          return {
            title: rj(document.querySelector('.title-bar, header')!),
            backs: [...document.querySelectorAll('ct-card.card.face-down')].map(rj),
            tiles: [...document.querySelectorAll('.tile')].map(rj),
            hand: [
              ...document.querySelectorAll('ct-card.card:not(.played):not(.flyer):not(.face-down)'),
            ].map(rj),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });

        const T = 1;

        // (1) + (2) opponent card backs: below the title AND within the viewport.
        expect(g.backs.length).toBeGreaterThan(0);
        for (const b of g.backs) {
          expect(
            b.top,
            `card back (top ${b.top}) overlaps title (bottom ${g.title.bottom})`,
          ).toBeGreaterThanOrEqual(g.title.bottom - T);
          expect(b.left, `card back off the left edge (${b.left})`).toBeGreaterThanOrEqual(-T);
          expect(
            b.right,
            `card back off the right edge (${b.right} > ${g.vw})`,
          ).toBeLessThanOrEqual(g.vw + T);
          expect(
            b.bottom,
            `card back below the viewport (${b.bottom} > ${g.vh})`,
          ).toBeLessThanOrEqual(g.vh + T);
        }

        // (3) hand cards must not overlap any board tile.
        expect(g.hand.length).toBeGreaterThan(0);
        for (const c of g.hand) {
          const hit = g.tiles.some((t) => overlaps(c, t));
          expect(hit, `a hand card (${JSON.stringify(c)}) overlaps a board tile`).toBe(false);
        }

        await ctx.close();
      });
    }
  }
});
