import { test, expect, request, APIRequestContext } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { createGame, setOnlyCard } from './support/seed';
import { handCards } from './support/steps';

// The special-card hint must be ENTIRELY visible and never collide with the
// footer or the hand cards — for every language, every hint, on desktop AND
// mobile. This is a real-browser layout test (jsdom has no geometry).

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const LANGS = ['en', 'nl', 'de', 'fr', 'nb', 'it'];

// The six special cards and their hint labels (for readable test names).
const HINTS = [
  { value: 1, key: 'Ace' },
  { value: 4, key: 'Four' },
  { value: 7, key: 'Seven' },
  { value: 11, key: 'Jack' },
  { value: 12, key: 'Queen' },
  { value: 13, key: 'King' },
];

// A hint is "clean" when its box is inside the viewport and overlaps neither the
// footer nor any hand card.
function checkClean(g: {
  hint: DOMRect;
  footer: DOMRect | null;
  cards: DOMRect[];
  vw: number;
  vh: number;
}): string[] {
  const T = 1; // 1px rounding tolerance
  const { hint, footer, cards, vw, vh } = g;
  const fails: string[] = [];

  if (!(hint.width > 0 && hint.height > 0)) fails.push('hint not rendered');
  if (hint.top < -T) fails.push(`hint.top ${hint.top} < 0`);
  if (hint.left < -T) fails.push(`hint.left ${hint.left} < 0`);
  if (hint.bottom > vh + T) fails.push(`hint.bottom ${hint.bottom} > viewport ${vh}`);
  if (hint.right > vw + T) fails.push(`hint.right ${hint.right} > viewport ${vw}`);

  if (footer && hint.bottom > footer.top + T)
    fails.push(`hint collides with footer (hint.bottom ${hint.bottom} > footer.top ${footer.top})`);

  const overlaps = (a: DOMRect, b: DOMRect) =>
    !(
      a.right <= b.left + T ||
      a.left >= b.right - T ||
      a.bottom <= b.top + T ||
      a.top >= b.bottom - T
    );
  if (cards.some((c) => overlaps(hint, c))) fails.push('hint overlaps a hand card');

  return fails;
}

test.describe('special-card hint layout', () => {
  const sessions: Record<number, string> = {};

  test.beforeAll(async () => {
    const api: APIRequestContext = await request.newContext({ baseURL: API_URL });
    // One game per hint value; player0 holds only that special card, so selecting
    // the single card surfaces exactly that hint.
    for (const { value } of HINTS) {
      const { sessionId, playerIds } = await createGame(api, 2);
      await setOnlyCard(api, sessionId, playerIds[0], value);
      sessions[value] = sessionId;
    }
    await api.dispose();
  });

  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      for (const { value, key } of HINTS) {
        test(`${vp.name} · ${lang} · ${key}`, async ({ browser }) => {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
          });
          await ctx.addCookies([
            { name: 'language', value: lang, url: 'http://localhost:4300' },
            { name: 'playerid', value: 'player0', url: 'http://localhost:4300' },
          ]);
          const page = await ctx.newPage();
          await page.goto(`/?sessionid=${sessions[value]}&playerid=player0`);
          await page.waitForSelector('ct-card.card:not(.flyer)', { timeout: 30000 });

          // Select the only card so its hint is shown.
          await handCards(page).first().click();
          await expect(page.locator('.card-hint')).not.toHaveText('', { timeout: 5000 });

          const geo = await page.evaluate(() => {
            const rect = (s: string) => {
              const el = document.querySelector(s);
              return el ? (el.getBoundingClientRect().toJSON() as DOMRect) : null;
            };
            return {
              hint: rect('.card-hint')!,
              footer: rect('footer, .footer-bar'),
              cards: [
                ...document.querySelectorAll(
                  'ct-card.card:not(.played):not(.flyer):not(.face-down)',
                ),
              ].map((c) => c.getBoundingClientRect().toJSON() as DOMRect),
              vw: window.innerWidth,
              vh: window.innerHeight,
            };
          });

          const fails = checkClean(geo);
          expect(fails, `${vp.name}/${lang}/${key}: ${fails.join('; ')}`).toEqual([]);

          await ctx.close();
        });
      }
    }
  }
});
