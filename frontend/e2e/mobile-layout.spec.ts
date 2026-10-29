import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame } from './support/seed';
import { openBoard } from './support/steps';

// Rewrite of MobileLayoutCheck_IT: on the mobile layout the board, the roster and
// the action buttons must all be fully on screen and must not overlap one another,
// for every player count from 2 to 8. (The GWT test bound GWT ids + a testLayout()
// helper; here we read the real Angular elements' geometry.)

const COUNTS = [2, 3, 4, 5, 6, 7, 8];
const MOBILE = { width: 390, height: 844 };

test.describe('mobile layout (MobileLayoutCheck_IT)', () => {
  for (const n of COUNTS) {
    test(`${n} players — board, roster & buttons on screen, no overlap`, async ({ browser }) => {
      const { page } = await openBoard(browser, { players: n, viewport: MOBILE });

      const g = await page.evaluate(() => {
        const rj = (s: string) => {
          const el = document.querySelector(s);
          return el ? (el.getBoundingClientRect().toJSON() as DOMRect) : null;
        };
        return {
          board: rj('.board'),
          buttons: rj('.button-container'),
          roster: rj('app-player-list'),
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });

      const T = 1;
      const onScreen = (r: DOMRect | null) =>
        !!r && r.top >= -T && r.left >= -T && r.right <= g.vw + T && r.bottom <= g.vh + T;
      const overlap = (a: DOMRect, b: DOMRect) =>
        !(
          a.right <= b.left + T ||
          b.right <= a.left + T ||
          a.bottom <= b.top + T ||
          b.bottom <= a.top + T
        );

      expect(onScreen(g.board), 'board on screen').toBe(true);
      expect(onScreen(g.buttons), 'buttons on screen').toBe(true);
      expect(onScreen(g.roster), 'roster on screen').toBe(true);

      expect(overlap(g.board!, g.buttons!), 'board vs buttons').toBe(false);
      expect(overlap(g.board!, g.roster!), 'board vs roster').toBe(false);
      expect(overlap(g.buttons!, g.roster!), 'buttons vs roster').toBe(false);

      await page.context().close();
    });
  }
});

// On a phone the roster spans the screen below the buttons, so a big game takes real height. The
// board sizes itself to leave the controls exactly the room they measure; if it took more, the
// last players would be pushed off the bottom of the screen. (Phones have no footer bar: the board
// takes that height too, so the room left is tighter.) From six players on the roster packs four
// to a row to give the board that height, and the board may use nearly the full width.
//
// The tiles must not shrink back to the unreadable ~5px a full team table once got: the smallest
// case here (8 in teams, short phone, hints on) measures 9.0px. A floor, not a target — raise it
// when the layout improves; turning the card hints off already buys ~1px.
const MIN_TILE_PX = 8.5;
const ROSTERS = [
  { label: '2 players', players: 2 },
  { label: '8 players', players: 8 },
  { label: '6 players in teams', players: 6, gameOptions: { teamPlay: true } },
  { label: '8 players in teams', players: 8, gameOptions: { teamPlay: true } },
];
const PHONES = [
  { label: 'short phone', width: 375, height: 667 }, // where the board is height-limited
  { label: 'tall phone', width: 390, height: 844 },
];

test.describe('phone roster stays on screen', () => {
  for (const roster of ROSTERS) {
    for (const phone of PHONES) {
      for (const hints of ['on', 'off']) {
        test(`${roster.label} · ${phone.label} · hints ${hints}`, async ({ browser }) => {
          const api = await request.newContext({ baseURL: API_URL });
          const { sessionId } = await createGame(api, roster.players, roster.gameOptions);
          await api.dispose();
          const ctx = await browser.newContext({ viewport: phone });
          await ctx.addCookies([
            { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
            { name: 'cardHints', value: hints === 'on' ? '1' : '0', url: 'http://localhost:4300' },
          ]);
          const page = await ctx.newPage();
          await page.goto(`/?sessionid=${sessionId}&playerid=player0`);
          await expect(page.locator('.chip')).toHaveCount(roster.players);

          const g = await page.evaluate(() => {
            const rj = (s: string) =>
              document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect;
            return {
              chips: [...document.querySelectorAll('.chip')].map(
                (c) => c.getBoundingClientRect().toJSON() as DOMRect,
              ),
              board: rj('.board'),
              tile: rj('.tile'),
              vw: window.innerWidth,
              vh: window.innerHeight,
            };
          });

          const T = 1;
          for (const c of g.chips) {
            expect(c.bottom, 'a player is pushed off the bottom of the screen').toBeLessThanOrEqual(
              g.vh + T,
            );
            expect(c.left, 'a player runs off the left edge').toBeGreaterThanOrEqual(-T);
            expect(c.right, 'a player runs off the right edge').toBeLessThanOrEqual(g.vw + T);
          }
          expect(g.board.left, 'the board runs off the left edge').toBeGreaterThanOrEqual(-T);
          expect(g.board.right, 'the board runs off the right edge').toBeLessThanOrEqual(g.vw + T);
          expect(g.tile.width, 'the tiles got too small to read').toBeGreaterThanOrEqual(
            MIN_TILE_PX,
          );

          await ctx.close();
        });
      }
    }
  }
});
