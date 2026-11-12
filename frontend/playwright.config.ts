import { defineConfig } from '@playwright/test';

// Proof-D harness (bucket D — true end-to-end tests against the real backend).
//
// Orchestration:
//   - The Spring backend runs on E2E_API_URL (default http://localhost:4200) and
//     exposes the same /test/* seeding hooks the GWT Selenium ITs used.
//   - Playwright serves the Angular app via `ng serve` on NG_PORT, with
//     proxy.conf.json forwarding /games, /moves, /gamestates (SSE), /cards,
//     /game-options and /chat to the backend. proxy.conf.json must target E2E_API_URL.
//   - Tests seed state by hitting the backend directly (an APIRequestContext with
//     baseURL = E2E_API_URL), then drive the served Angular UI at baseURL.
//
// NOTE: ng serve defaults to port 4200, which the backend occupies — so the UI is
// served on a separate port (NG_PORT, default 4300) to avoid the clash.

const NG_PORT = Number(process.env.E2E_NG_PORT ?? 4300);
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4200';

// The layout specs each set up their own games once, then only look: every test opens a fresh
// page in its own viewport and language and measures it, changing nothing on the server. So they
// can run side by side. Every other spec plays moves on its game and stays one at a time.
const LAYOUT_SPECS = /(controls|header|hint)-layout\.spec\.ts/;
// CI's runner has 4 cores, shared with ng serve and the backend: fewer workers there.
const LAYOUT_WORKERS = process.env.CI ? 2 : 4;

export default defineConfig({
  testDir: './e2e',
  // One worker for the serial specs, the rest for the layout specs, which run alongside them.
  workers: LAYOUT_WORKERS + 1,
  projects: [
    { name: 'layout', testMatch: LAYOUT_SPECS, fullyParallel: true, workers: LAYOUT_WORKERS },
    { name: 'serial', testIgnore: LAYOUT_SPECS, fullyParallel: false, workers: 1 },
  ],
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Warm up ng serve (first compile is slow in CI) before the tests run.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${NG_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run start -- --port ${NG_PORT} --proxy-config proxy.conf.json`,
    url: `http://localhost:${NG_PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
