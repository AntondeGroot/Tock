import { test, request, Browser, Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL } from '../playwright.config';
import { createGame, setHand, setPawn } from './support/seed';

/**
 * Docs generator (not a test): seeds a game per player-count, screenshots the real Angular board
 * into readme-images/, and rewrites the auto-generated block in the repo README. Because it shoots
 * the live app, the images always track the current board styling.
 *
 * Guarded by an env var so the normal `npx playwright test` run (and CI) skips it. Run it with
 * `./generate-readme-images.sh`, which also boots the backend the seeding hooks need.
 *
 * Every ingredient of the shot is pinned — /test/start-game deals without shuffling the seats, the
 * pawns are placed explicitly, and the viewer's hand is set through /test/set-hand (the deck itself
 * IS shuffled, so without that the five card faces would differ every run). Rerunning on the same
 * machine therefore reproduces the same images.
 */

const UI = 'http://localhost:4300';
const REPO_ROOT = path.resolve(__dirname, '../..');
const IMG_DIR = path.join(REPO_ROOT, 'readme-images');
const README = path.join(REPO_ROOT, 'README.md');
const IMG_REL = 'readme-images';
const START_MARKER = '<!-- GAMES:START -->';
const END_MARKER = '<!-- GAMES:END -->';

const VIEWPORT = { width: 1280, height: 900 };
/** Felt left below the lowest content before the shot is cropped (CSS px). */
const BOTTOM_MARGIN = 24;

interface Scenario {
  /** Image file name (without extension) and the anchor for its README entry. */
  key: string;
  title: string;
  description: string;
  players: number;
  gameOptions?: Record<string, unknown>;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'game-2-players',
    title: '2 players',
    description:
      'The smallest game: two sections facing each other. Every player plays for themselves.',
    players: 2,
  },
  {
    key: 'game-4-players',
    title: '4 players',
    description:
      'The classic setup: four sections, four pawns each. The board always rotates so your own ' +
      'section is at the bottom and the other players fan their cards around you.',
    players: 4,
  },
  {
    key: 'game-6-players-teams',
    title: '6 players, in teams',
    description:
      'With team play on, an even number of players pairs up with the seat opposite — six ' +
      'players make three teams. Each pawn flies its team pennant and the roster lists the ' +
      'pairs; once all your own pawns are home you play your teammate’s.',
    players: 6,
    gameOptions: { teamPlay: true },
  },
];

/**
 * Pawn placements applied to every player, so the shots show a game underway rather than
 * sixteen pawns stacked in their nests: two pawns out on their own section of the track, one
 * already in the finish lane, and the fourth still waiting in the nest. Each player only ever
 * occupies their own section here, so no two pawns can land on the same tile.
 */
const PAWN_PLACEMENTS: { pawnNr: number; tileNr: number }[] = [
  { pawnNr: 0, tileNr: 3 },
  { pawnNr: 1, tileNr: 11 },
  { pawnNr: 2, tileNr: 16 }, // first tile of the finish lane
];

/** The viewer's hand: two plain cards among Ace / Seven / King, so the gold special highlight shows. */
const VIEWER_HAND = [1, 3, 7, 9, 13];
const VIEWER = 'player0';

test.describe('readme images', () => {
  test.skip(
    process.env.GENERATE_README_IMAGES !== 'true',
    'docs generator — run ./generate-readme-images.sh',
  );
  // Booting three games and waiting out the render settles well past the default timeout.
  test.setTimeout(180_000);

  test('generate the README board previews', async ({ browser }) => {
    await mkdir(IMG_DIR, { recursive: true });
    for (const scenario of SCENARIOS) {
      await captureScenario(browser, scenario);
    }
    await rewriteReadme();
  });
});

async function captureScenario(browser: Browser, scenario: Scenario): Promise<void> {
  const api = await request.newContext({ baseURL: API_URL });
  const { sessionId, playerIds } = await createGame(api, scenario.players, scenario.gameOptions);
  for (const playerId of playerIds) {
    for (const { pawnNr, tileNr } of PAWN_PLACEMENTS) {
      await setPawn(api, sessionId, playerId, pawnNr, playerId, tileNr);
    }
  }
  // Only the viewer's hand is rendered face-up; the opponents just show five card backs each.
  await setHand(api, sessionId, VIEWER, VIEWER_HAND);
  await api.dispose();

  const page = await openBoard(browser, sessionId);
  await page.screenshot({
    path: path.join(IMG_DIR, `${scenario.key}.png`),
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: await contentHeight(page) },
    // The active player's chip pulses forever, so an un-frozen shot catches it at a random phase
    // and no two runs produce the same PNG. This rewinds looping animations to their first frame.
    animations: 'disabled',
  });
  await page.context().close();
}

/**
 * How far down the page the game actually reaches. The layout reserves a fixed band under the hand
 * (and pins the nav footer to the bottom of the viewport), so a plain viewport shot ends in a strip
 * of empty felt — crop to the lowest of the board, the hand and the roster instead.
 */
async function contentHeight(page: Page): Promise<number> {
  const bottom = await page.evaluate(
    (selectors) =>
      selectors
        .flatMap((s) => [...document.querySelectorAll(s)])
        .reduce((lowest, el) => Math.max(lowest, el.getBoundingClientRect().bottom), 0),
    ['.stage', '.controls', 'app-card.card:not(.flyer)'],
  );
  return Math.min(VIEWPORT.height, Math.ceil(bottom) + BOTTOM_MARGIN);
}

/** Open the board as the viewer at a fixed desktop viewport, waiting until it has settled. */
async function openBoard(browser: Browser, sessionId: string): Promise<Page> {
  // 1x: the shot is already 1280px wide against the 700px the README renders it at, and a 2x
  // shot quadrupled the PNG weight (~1 MB each) for no visible gain.
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addCookies([{ name: 'playerid', value: VIEWER, url: UI }]);
  const page = await ctx.newPage();
  await page.goto(`/?sessionid=${sessionId}&playerid=${VIEWER}`);
  await page.waitForSelector('app-card.card', { timeout: 30_000 });
  await page.waitForSelector('.tile', { timeout: 30_000 });
  await page.waitForSelector('.card-back', { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  // The cards fan in and the pawns ease to their tiles on first render. Nothing signals "settled"
  // (the turn indicator pulses forever, so waiting on document.getAnimations() never resolves), and
  // every one of those transitions is well under a second — so just sit out the longest of them.
  await page.waitForTimeout(2_500);
  return page;
}

/** Replace the auto-generated block in README.md with one entry per scenario. */
async function rewriteReadme(): Promise<void> {
  const block = [
    START_MARKER,
    '<!-- Auto-generated by frontend/e2e/readme-images.spec.ts. Do not edit between these markers;',
    '     run `./generate-readme-images.sh` to refresh the images and this text. -->',
    '',
    ...SCENARIOS.flatMap((s) => [
      `### ${s.title}`,
      '',
      s.description,
      '',
      `<img src="${IMG_REL}/${s.key}.png" alt="${s.title}" width="700">`,
      '',
    ]),
    END_MARKER,
  ].join('\n');

  const readme = await readFile(README, 'utf8');
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start < 0 || end < 0) {
    throw new Error(`README.md is missing the ${START_MARKER} / ${END_MARKER} markers`);
  }
  await writeFile(README, readme.slice(0, start) + block + readme.slice(end + END_MARKER.length));
}
