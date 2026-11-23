import type { Browser } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** GitHub's recommended size for a repository's social preview. */
const SIZE = { width: 1280, height: 640 };
const TEMPLATE = path.join(__dirname, 'social-preview.html');

/**
 * Render the repo's social preview into `imgDir`. The page shows the README screenshots, so this
 * runs after they are taken; the PNG is uploaded by hand in the repo's settings on GitHub.
 */
export async function captureSocialPreview(browser: Browser, imgDir: string): Promise<void> {
  const page = await browser.newPage({ viewport: SIZE });
  await page.goto(pathToFileURL(TEMPLATE).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(imgDir, 'social-preview.png') });
  await page.close();
}
