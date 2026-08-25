import { test, request, APIRequestContext, Browser, Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL } from '../playwright.config';
import { createGame, getHand, setHand, setPawn, teamTrade } from './support/seed';

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

/** Felt left below the lowest content before the shot is cropped (CSS px). */
const BOTTOM_MARGIN = 24;

/**
 * Every game is shot twice, once per form factor. The app switches layout at the 699px breakpoint
 * (see the `max-width: 699px` blocks in the SCSS), so the phone viewport exercises a genuinely
 * different board — not just a narrower one.
 */
interface Device {
  /** Suffix on the image file name, e.g. `game-4-players-mobile.png`. */
  key: string;
  label: string;
  viewport: { width: number; height: number };
  /** How wide the README renders it (px) — a phone shot needs far less room than a desktop one. */
  readmeWidth: number;
  isMobile?: boolean;
}

const DEVICES: Device[] = [
  {
    key: 'desktop',
    label: 'On a computer',
    viewport: { width: 1280, height: 900 },
    readmeWidth: 620,
  },
  {
    key: 'mobile',
    label: 'On a phone',
    // A mid-size modern handset in CSS px, below the 699px breakpoint.
    viewport: { width: 390, height: 844 },
    readmeWidth: 200,
    isMobile: true,
  },
];

interface Scenario {
  /** Image file name (without the device suffix) and the anchor for its README entry. */
  key: string;
  title: string;
  description: string;
  players: number;
  gameOptions?: Record<string, unknown>;
  /** Card values dealt to the viewer, when the default hand would not fit the story. */
  viewerHand?: number[];
  /**
   * Where the pawns start, when the default (every player part-way round) would clutter the shot.
   * Anything left unplaced stays in its nest.
   */
  placePawns?: (api: APIRequestContext, sessionId: string, playerIds: string[]) => Promise<void>;
  /** Extra backend seeding once the game exists — e.g. opening a pending card trade. */
  seed?: (api: APIRequestContext, sessionId: string) => Promise<void>;
  /**
   * Drive the UI into the state to be shot, with the board already on screen: click a dialog open,
   * or have another player act (through `api`) so the viewer sees the result arrive over SSE.
   */
  open?: (page: Page, api: APIRequestContext, sessionId: string) => Promise<void>;
}

/** The viewer's hand: two plain cards among Ace / Seven / King, so the gold special highlight shows. */
const VIEWER_HAND = [1, 3, 7, 9, 13];
/**
 * Whoever is doing the asking holds neither a King nor an Ace — that is *why* they ask. Pinning it
 * also fixes the card they offer, and (on the answering side) keeps their offer off the dialog.
 */
const ASKER_HAND = [2, 4, 6, 8, 10];
const VIEWER = 'player0';

/** The viewer's teammate in a 4-player game: teams pair seat i with seat i + n/2. */
const TEAMMATE = 'player2';
const TEAM_TRADE_GAME = { teamPlay: true, teamCardTrade: true };

const SCENARIOS: Scenario[] = [
  {
    key: 'game-2-players',
    title: '2 players',
    description:
      'The smallest game: two sections facing each other. Every player plays for themselves.',
    players: 2,
  },
  {
    key: 'game-2-players-wide-board',
    title: '2 players on a four-seat board',
    description:
      'The same two players, given twice as much board to cross. With this option on they sit ' +
      'opposite each other on a four-seat board and the seats between them stay empty: plain ' +
      'track with no nest, no finish lane and nobody waiting for a turn there.',
    players: 2,
    gameOptions: { twoPlayersOnFourSeats: true },
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
  {
    key: 'split-seven',
    title: 'Splitting a seven across two pawns',
    description:
      'A seven is the one card you may divide between two of your pawns, in any share that adds ' +
      'up to seven — three steps for one and four for the other here. Pick the card and both ' +
      'pawns, then set the split. Every other pawn is still in its nest, so the only two on the ' +
      'board are the two being moved.',
    players: 4,
    placePawns: async (api, sessionId) => {
      // Only the two pawns the split moves are out; nothing else competes for attention.
      await setPawn(api, sessionId, VIEWER, 0, VIEWER, 3);
      await setPawn(api, sessionId, VIEWER, 1, VIEWER, 9);
    },
    open: (page) => selectSplitOfSeven(page),
  },
  {
    key: 'trade-ask',
    title: 'Asking your teammate for a King or Ace',
    description:
      'Only a King or an Ace gets a pawn out of the nest, so with the team-trade option on you ' +
      'may ask your teammate for one. The button asks there and then — your teammate already has ' +
      'the message — and all that is left is picking what you give back. The cards swell in turn ' +
      'until you do; tapping one sends it, and tapping another changes your mind.',
    players: 4,
    gameOptions: TEAM_TRADE_GAME,
    viewerHand: ASKER_HAND,
    open: (page) => openTradeDialog(page, '.ask-trade-button'),
  },
  {
    key: 'trade-waiting',
    title: 'Your teammate hears it straight away',
    description:
      'The other side of that moment: the ask arrives before you have chosen anything, and your ' +
      'teammate can answer it at once. Once they have handed a King over it simply waits for you ' +
      '— whichever of you picks last completes the swap.',
    players: 4,
    gameOptions: TEAM_TRADE_GAME,
    // The TEAMMATE is the viewer, having already given their King while the ask is unanswered.
    seed: (api, sessionId) => openTrade(api, sessionId, TEAMMATE, false),
    open: async (page) => {
      await page.click('[data-testid="trade-card-13"]');
      await page.click('.trade-btn.primary');
      await page.waitForSelector('.trade-btn.primary', { state: 'detached' });
    },
  },
  {
    key: 'trade-respond',
    title: 'Handing one over',
    description:
      'Your side of the swap. Everything but the Kings and Aces is dimmed out — those are the ' +
      'only cards that answer the ask — so you either give one, or decline.',
    players: 4,
    gameOptions: TEAM_TRADE_GAME,
    // The TEAMMATE asks this time, so the viewer is the one being asked.
    seed: (api, sessionId) => openTrade(api, sessionId, TEAMMATE),
  },
  {
    key: 'trade-rejected',
    title: 'When they cannot help',
    description:
      'A teammate holding neither a King nor an Ace can only decline. The answer reaches you as ' +
      'a banner, your offered card stays in your hand, and the trade window closes — you are free ' +
      'to ask again after the next deal.',
    players: 4,
    gameOptions: TEAM_TRADE_GAME,
    viewerHand: ASKER_HAND,
    seed: (api, sessionId) => openTrade(api, sessionId, VIEWER), // the viewer asked…
    open: async (page, api, sessionId) => {
      await page.waitForSelector('.trade-dialog'); // …and is watching the waiting dialog
      await teamTrade(api, sessionId, TEAMMATE, 'REJECT'); // the answer comes back over SSE
      await page.waitForSelector('.team-handoff-toast');
    },
  },
];

/**
 * Open a pending trade: `requesterId` asks for a King or Ace. The ask carries no card — that is
 * the point of the flow — so `withOffer` decides whether they have also picked what they give,
 * which is what unblocks their teammate.
 */
async function openTrade(
  api: APIRequestContext,
  sessionId: string,
  requesterId: string,
  withOffer = true,
): Promise<void> {
  await setHand(api, sessionId, requesterId, ASKER_HAND);
  await teamTrade(api, sessionId, requesterId, 'REQUEST');
  if (withOffer) {
    const hand = await getHand(api, sessionId, requesterId);
    await teamTrade(api, sessionId, requesterId, 'OFFER', hand[0]);
  }
}

/**
 * Select the seven and both pawns, then nudge the split off its 0/7 default so the picture shows
 * an actual division. The step boxes only exist once a card and two pawns are picked, and no
 * server state can express a selection — it lives in the client.
 */
async function selectSplitOfSeven(page: Page): Promise<void> {
  await page.click('[data-testid="card-7"]');
  await page.click(`[data-testid="pawn-${VIEWER}:0"]`);
  await page.click(`[data-testid="pawn-${VIEWER}:1"]`);
  await page.waitForSelector('app-split-steps');
  const plus = 'app-split-steps .pawn-steps__row:first-child .pawn-step-btn:last-child';
  for (let step = 0; step < 3; step++) {
    await page.click(plus);
  }
  // Each change re-previews the landing tiles over the network; let the last one land so the
  // highlighted tiles are the same on every run.
  await page.waitForTimeout(1_000);
}

/** Click a button that opens a dialog and wait for it, since no server state can seed one. */
async function openTradeDialog(page: Page, buttonSelector: string): Promise<void> {
  await page.click(buttonSelector);
  await page.waitForSelector('.trade-dialog');
}

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

test.describe('readme images', () => {
  test.skip(
    process.env.GENERATE_README_IMAGES !== 'true',
    'docs generator — run ./generate-readme-images.sh',
  );
  // Booting a game per scenario and waiting out each render settles well past the default timeout.
  test.setTimeout(300_000);

  test('generate the README board previews', async ({ browser }) => {
    await mkdir(IMG_DIR, { recursive: true });
    for (const scenario of SCENARIOS) {
      await captureScenario(browser, scenario);
    }
    await rewriteReadme();
  });
});

async function captureScenario(browser: Browser, scenario: Scenario): Promise<void> {
  // A fresh game per device: everything is pinned, so both shots still show the identical
  // position — and a scenario whose state is CONSUMED by the shot (a trade that gets rejected)
  // finds it there again for the second one.
  for (const device of DEVICES) {
    const api = await request.newContext({ baseURL: API_URL });
    const sessionId = await seedGame(api, scenario);
    await captureDevice(browser, scenario, device, sessionId, api);
    await api.dispose();
  }
}

/** Build the scenario's game: players seated, pawns placed, hands pinned, extra state seeded. */
async function seedGame(api: APIRequestContext, scenario: Scenario): Promise<string> {
  const { sessionId, playerIds } = await createGame(api, scenario.players, scenario.gameOptions);
  if (scenario.placePawns) {
    await scenario.placePawns(api, sessionId, playerIds);
  } else {
    for (const playerId of playerIds) {
      for (const { pawnNr, tileNr } of PAWN_PLACEMENTS) {
        await setPawn(api, sessionId, playerId, pawnNr, playerId, tileNr);
      }
    }
  }
  // Only the viewer's hand is rendered face-up; the opponents just show five card backs each.
  await setHand(api, sessionId, VIEWER, scenario.viewerHand ?? VIEWER_HAND);
  await scenario.seed?.(api, sessionId);
  return sessionId;
}

async function captureDevice(
  browser: Browser,
  scenario: Scenario,
  device: Device,
  sessionId: string,
  api: APIRequestContext,
): Promise<void> {
  const page = await openBoard(browser, sessionId, device);
  await scenario.open?.(page, api, sessionId);
  await page.screenshot({
    path: path.join(IMG_DIR, `${scenario.key}-${device.key}.png`),
    clip: {
      x: 0,
      y: 0,
      width: device.viewport.width,
      height: await contentHeight(page, device),
    },
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
async function contentHeight(page: Page, device: Device): Promise<number> {
  // A modal dims the entire board behind it (a fixed, full-screen backdrop), so shoot the whole
  // screen — cropping partway down would slice the dimmed area and read as a rendering fault.
  if (await page.locator('.trade-overlay').count()) {
    return device.viewport.height;
  }
  const bottom = await page.evaluate(
    (selectors) =>
      selectors
        .flatMap((s) => [...document.querySelectorAll(s)])
        .reduce((lowest, el) => Math.max(lowest, el.getBoundingClientRect().bottom), 0),
    ['.stage', '.controls', 'app-card.card:not(.flyer)'],
  );
  // On a phone the game can reach past the fold; clamping to the viewport keeps the shot looking
  // like an actual screen rather than a stretched page.
  return Math.min(device.viewport.height, Math.ceil(bottom) + BOTTOM_MARGIN);
}

/** Open the board as the viewer at this device's viewport, waiting until it has settled. */
async function openBoard(browser: Browser, sessionId: string, device: Device): Promise<Page> {
  // 1x: the shot is already 1280px wide against the 620px the README renders it at, and a 2x
  // shot quadrupled the PNG weight (~1 MB each) for no visible gain.
  const ctx = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
  });
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
      // A table puts the two form factors side by side, so the layout difference reads at a glance.
      `| ${DEVICES.map((d) => d.label).join(' | ')} |`,
      `| ${DEVICES.map(() => '---').join(' | ')} |`,
      `| ${DEVICES.map(
        (d) =>
          `<img src="${IMG_REL}/${s.key}-${d.key}.png" alt="${s.title}, ${d.label.toLowerCase()}" width="${d.readmeWidth}">`,
      ).join(' | ')} |`,
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
