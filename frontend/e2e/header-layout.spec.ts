import { test, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame } from './support/seed';

// Mobile header: the title bar carries the title, centred on the screen, between a red exit icon
// (Leave, left) and the rules book + settings cog (right). Phones have no footer bar. Nothing may
// collide, wrap or run off-screen in any language — also on a narrow phone, where the title
// shrinks to stay on one line — and the Leave confirm dialog must fit on screen.

const LANGS = ['en', 'nl', 'de', 'fr', 'nb', 'it'];
const PHONES = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'narrow phone', width: 360, height: 740 }, // the title shrinks here
];

test.describe('mobile header', () => {
  let session = '';

  test.beforeAll(async () => {
    const api = await request.newContext({ baseURL: API_URL });
    session = (await createGame(api, 2)).sessionId;
    await api.dispose();
  });

  for (const phone of PHONES) {
    for (const lang of LANGS) {
      test(`${phone.label} · ${lang} · header & confirm fit`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: phone });
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
          // The title's TEXT, not its padded box: one rect per line it wraps onto.
          const titleText = document.createRange();
          titleText.selectNodeContents(document.querySelector('.title-bar')!);
          const titleLines = [...titleText.getClientRects()].map((r) => r.toJSON() as DOMRect);
          return {
            leave: rj('.leaveGameButton'),
            rules: rj('.rulesButton'),
            settings: rj('.settingsButton'),
            titleBar: rj('.title-bar'),
            titleLines,
            footer: rj('.footer-bar'),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });

        const T = 1;
        // Leave: top-left, on screen, kept to the left half so it clears the centred title.
        expect(g.leave!.left).toBeGreaterThanOrEqual(-T);
        expect(g.leave!.top).toBeGreaterThanOrEqual(-T);
        expect(g.leave!.right, 'exit icon should stay left of centre').toBeLessThanOrEqual(
          g.vw / 2,
        );

        // Settings: the cog mirrors the exit icon — top-right, on screen, up in the title bar.
        expect(g.settings!.top).toBeGreaterThanOrEqual(-T);
        expect(g.settings!.right).toBeLessThanOrEqual(g.vw + T);
        expect(g.settings!.bottom, 'cog should sit in the title bar').toBeLessThanOrEqual(
          g.titleBar!.bottom + T,
        );

        // Rules: the book sits just left of the cog, also in the title bar, right of centre.
        expect(g.rules!.right, 'rules should sit left of the cog').toBeLessThanOrEqual(
          g.settings!.left + T,
        );
        expect(g.rules!.left, 'rules should stay right of centre').toBeGreaterThanOrEqual(g.vw / 2);
        expect(g.rules!.top).toBeGreaterThanOrEqual(-T);
        expect(g.rules!.bottom, 'rules should sit in the title bar').toBeLessThanOrEqual(
          g.titleBar!.bottom + T,
        );

        // Title: one line, centred on the screen, clear of the icons on both sides.
        expect(g.titleLines, 'the title should fit on one line').toHaveLength(1);
        const [title] = g.titleLines;
        expect(
          Math.abs((title.left + title.right) / 2 - g.vw / 2),
          'the title should be centred on the screen',
        ).toBeLessThanOrEqual(T);
        expect(title.left, 'the title runs into the exit icon').toBeGreaterThanOrEqual(
          g.leave!.right,
        );
        expect(title.right, 'the title runs into the rules icon').toBeLessThanOrEqual(
          g.rules!.left,
        );

        // No footer bar on a phone: it draws nothing, its buttons having moved up.
        expect(g.footer!.height, 'the footer should not show on a phone').toBe(0);

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
  }

  test('desktop keeps Leave top-left and Rules/Settings top-right', async ({ browser }) => {
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
