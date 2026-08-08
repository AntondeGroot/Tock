import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame, setOnlyCard, setPawn } from './support/seed';

// The actions + roster ("controls") are responsive: a column in the right gutter
// on desktop, a row below the card hint on mobile. In both, everything must stay
// on screen and clear of the board — including an 8-player roster.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
const PLAYER_COUNTS = [2, 4, 8];
// The button labels vary a lot in width per language (e.g. "Play Card" vs
// "Kaart spelen"), which drives the controls layout — so test them all.
const LANGS = ['en', 'nl', 'de', 'fr', 'nb'];

test.describe('controls + roster placement', () => {
  const sessions: Record<number, string> = {};
  let sevenSession = '';

  test.beforeAll(async () => {
    const api = await request.newContext({ baseURL: API_URL });
    for (const n of PLAYER_COUNTS) {
      const { sessionId } = await createGame(api, n);
      sessions[n] = sessionId;
    }
    // A 7-split setup: player0 holds only a 7 with two pawns on the board, so
    // selecting the card + both pawns reveals the split step boxes.
    const seven = await createGame(api, 2);
    sevenSession = seven.sessionId;
    await setPawn(api, sevenSession, 'player0', 0, 'player0', 0);
    await setPawn(api, sevenSession, 'player0', 1, 'player0', 13);
    await setOnlyCard(api, sevenSession, 'player0', 7);
    await api.dispose();
  });

  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      for (const n of PLAYER_COUNTS) {
        test(`${vp.name} · ${lang} · ${n} players`, async ({ browser }) => {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
          });
          await ctx.addCookies([
            { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
            { name: 'language', value: lang, url: 'http://localhost:4300' },
          ]);
          const page = await ctx.newPage();
          await page.goto(`/?sessionid=${sessions[n]}&playerid=player0`);
          await page.waitForSelector('.chip', { timeout: 30000 });
          await expect(page.locator('.chip')).toHaveCount(n); // every player is shown

          const g = await page.evaluate(() => {
            const rj = (s: string) => {
              const el = document.querySelector(s);
              return el ? (el.getBoundingClientRect().toJSON() as DOMRect) : null;
            };
            return {
              controls: rj('.controls'),
              board: rj('.board'),
              hint: rj('.card-hint'),
              chips: [...document.querySelectorAll('.chip')].map(
                (c) => c.getBoundingClientRect().toJSON() as DOMRect,
              ),
              vw: window.innerWidth,
              vh: window.innerHeight,
            };
          });

          const T = 1;
          // Controls fully within the viewport.
          expect(g.controls).not.toBeNull();
          expect(g.controls!.top).toBeGreaterThanOrEqual(-T);
          expect(g.controls!.left).toBeGreaterThanOrEqual(-T);
          expect(g.controls!.right).toBeLessThanOrEqual(g.vw + T);
          expect(g.controls!.bottom).toBeLessThanOrEqual(g.vh + T);

          // Every chip fully on screen (the 8-player overflow guard).
          for (const c of g.chips) {
            expect(c.top, `chip above the viewport`).toBeGreaterThanOrEqual(-T);
            expect(c.bottom, `chip below the viewport (${c.bottom} > ${g.vh})`).toBeLessThanOrEqual(
              g.vh + T,
            );
            expect(c.left).toBeGreaterThanOrEqual(-T);
            expect(c.right).toBeLessThanOrEqual(g.vw + T);
          }

          if (vp.name === 'desktop') {
            // Right gutter, clear of the board.
            expect(
              g.controls!.left,
              'controls should sit right of the board',
            ).toBeGreaterThanOrEqual(g.board!.right - T);
          } else {
            // Below the card hint, clear of the board.
            expect(g.controls!.top, 'controls should sit below the hint').toBeGreaterThanOrEqual(
              g.hint!.bottom - T,
            );
          }

          await ctx.close();
        });
      }
    }
  }

  // Selecting a 7 with two pawns reveals the split step boxes. Where they belong depends on the
  // layout: tucked inside the button box on desktop, but a band under the hand on a phone —
  // stacked under the buttons they made that column so tall the last row fell off the screen.
  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      test(`${vp.name} · ${lang} · 7-split step boxes`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctx.addCookies([
          { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
          { name: 'language', value: lang, url: 'http://localhost:4300' },
        ]);
        const page = await ctx.newPage();
        await page.goto(`/?sessionid=${sevenSession}&playerid=player0`);
        await page.waitForSelector('app-card.card', { timeout: 30000 });

        // Select the 7, then click pawns until both are chosen and the split shows.
        await page.click('app-card.card', { force: true });
        for (const pw of await page.$$('app-pawn.pawn')) {
          if (await page.$('.pawn-steps')) break;
          await pw.click({ force: true }).catch(() => {});
          await page.waitForTimeout(120);
        }
        await expect(page.locator('.pawn-steps')).toBeVisible();

        const g = await page.evaluate(() => {
          const rj = (s: string) => {
            const el = document.querySelector(s);
            return el ? (el.getBoundingClientRect().toJSON() as DOMRect) : null;
          };
          const rects = (s: string) =>
            [...document.querySelectorAll(s)].map(
              (e) => e.getBoundingClientRect().toJSON() as DOMRect,
            );
          return {
            box: rj('.button-container'),
            controls: rj('.controls'),
            split: rj('.pawn-steps'),
            nestedInButtonBox: document.querySelectorAll('.button-container .pawn-steps').length,
            splitParts: [
              rj('.pawn-steps')!,
              ...rects('.pawn-step-btn'),
              ...rects('.pawn-steps__input'),
            ],
            chips: rects('.chip'),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });

        const T = 1;
        if (vp.name === 'desktop') {
          // Every split control stays within the button box — no overflow. The cap that keeps the
          // buttons narrow enough to sit beside the roster used to squeeze the steppers out of it.
          expect(g.nestedInButtonBox, 'desktop keeps the split in the button box').toBe(1);
          for (const el of g.splitParts) {
            expect(el.left, 'split control overflows the button box (left)').toBeGreaterThanOrEqual(
              g.box!.left - T,
            );
            expect(el.right, 'split control overflows the button box (right)').toBeLessThanOrEqual(
              g.box!.right + T,
            );
          }
        } else {
          // The phone lifts it out into a full-width band above the controls. The rule that
          // matters there is that all of it is on screen — it used to run off the bottom.
          expect(g.nestedInButtonBox, 'the phone must not nest the split in the button box').toBe(
            0,
          );
          for (const el of g.splitParts) {
            expect(el.left, 'split control off screen (left)').toBeGreaterThanOrEqual(-T);
            expect(el.right, 'split control off screen (right)').toBeLessThanOrEqual(g.vw + T);
            expect(el.bottom, 'split control off screen (bottom)').toBeLessThanOrEqual(g.vh + T);
          }
          expect(g.split!.bottom, 'the split band sits above the controls row').toBeLessThanOrEqual(
            g.controls!.top + T,
          );
        }
        // Controls and every chip stay on screen.
        expect(g.controls!.left).toBeGreaterThanOrEqual(-T);
        expect(g.controls!.right).toBeLessThanOrEqual(g.vw + T);
        expect(g.controls!.bottom).toBeLessThanOrEqual(g.vh + T);
        for (const c of g.chips) {
          expect(c.left).toBeGreaterThanOrEqual(-T);
          expect(c.top).toBeGreaterThanOrEqual(-T);
          expect(c.right).toBeLessThanOrEqual(g.vw + T);
          expect(c.bottom).toBeLessThanOrEqual(g.vh + T);
        }

        await ctx.close();
      });
    }
  }
});
