import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame } from './support/seed';

// Option D mobile header: the title bar carries just the title + a red exit icon
// (Leave), and the footer bar holds Rules + Language. Nothing may collide or run
// off-screen in any language, and the Leave confirm dialog must fit on screen.

const LANGS = ['en', 'nl', 'de', 'fr', 'nb', 'it'];

test.describe('mobile header (Option D)', () => {
  let session = '';

  test.beforeAll(async () => {
    const api = await request.newContext({ baseURL: API_URL });
    session = (await createGame(api, 2)).sessionId;
    await api.dispose();
  });

  for (const lang of LANGS) {
    test(`mobile · ${lang} · header, footer & confirm fit`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([
        { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
        { name: 'language', value: lang, url: 'http://localhost:4300' },
      ]);
      const page = await ctx.newPage();
      await page.goto(`/?sessionid=${session}&playerid=player0`);
      await page.waitForSelector('.leaveGameButton', { timeout: 30000 });

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
          leave: rj('.leaveGameButton'),
          footer: rj('.footer-bar'),
          nav: rj('.footer-nav'),
          navChildren: rects('.footer-nav > *'),
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });

      const T = 1;
      // Leave: top-left, on screen, kept to the left half so it clears the centred title.
      expect(g.leave!.left).toBeGreaterThanOrEqual(-T);
      expect(g.leave!.top).toBeGreaterThanOrEqual(-T);
      expect(g.leave!.right, 'exit icon should stay left of centre').toBeLessThanOrEqual(g.vw / 2);

      // Rules + Language live inside the footer, fully on screen, in every language.
      expect(g.nav!.left).toBeGreaterThanOrEqual(-T);
      expect(g.nav!.right).toBeLessThanOrEqual(g.vw + T);
      expect(g.nav!.top).toBeGreaterThanOrEqual(g.footer!.top - T);
      expect(g.nav!.bottom).toBeLessThanOrEqual(g.footer!.bottom + T);
      for (const c of g.navChildren) {
        expect(c.left).toBeGreaterThanOrEqual(-T);
        expect(c.right).toBeLessThanOrEqual(g.vw + T);
      }

      // The Leave confirm dialog opens and fits on screen, buttons within the box.
      await page.click('.leaveGameButton');
      await expect(page.locator('.leave-dialog')).toBeVisible();
      const d = await page.evaluate(() => {
        const rj = (s: string) =>
          document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect;
        const rects = (s: string) =>
          [...document.querySelectorAll(s)].map(
            (e) => e.getBoundingClientRect().toJSON() as DOMRect,
          );
        return {
          dialog: rj('.leave-dialog'),
          btns: rects('.leave-dialog button'),
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      expect(d.dialog.left).toBeGreaterThanOrEqual(-T);
      expect(d.dialog.right).toBeLessThanOrEqual(d.vw + T);
      expect(d.dialog.top).toBeGreaterThanOrEqual(-T);
      expect(d.dialog.bottom).toBeLessThanOrEqual(d.vh + T);
      for (const btn of d.btns) {
        expect(btn.left).toBeGreaterThanOrEqual(d.dialog.left - T);
        expect(btn.right).toBeLessThanOrEqual(d.dialog.right + T);
      }

      await ctx.close();
    });
  }

  test('desktop keeps Leave top-left and Rules/Language top-right', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies([{ name: 'playerid', value: 'player0', url: 'http://localhost:4300' }]);
    const page = await ctx.newPage();
    await page.goto(`/?sessionid=${session}&playerid=player0`);
    await page.waitForSelector('.leaveGameButton', { timeout: 30000 });

    const g = await page.evaluate(() => {
      const rj = (s: string) =>
        document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect;
      return { leave: rj('.leaveGameButton'), nav: rj('.footer-nav'), vw: window.innerWidth };
    });
    // Leave stays a labelled plaque top-left; nav is hoisted to the top-right.
    expect(g.leave.left).toBeLessThan(g.vw / 2);
    expect(g.leave.top).toBeLessThan(120);
    expect(g.nav.right).toBeGreaterThan(g.vw / 2);
    expect(g.nav.top).toBeLessThan(120);
    await ctx.close();
  });
});
