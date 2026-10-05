import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Browser, Locator, Page, test as base } from '@playwright/test';
import sharp from 'sharp';

/** Where the images of the guide are written. */
export const IMAGES = resolve(__dirname, '../../../docs/images/guide');

/** A picture over this is too big for a repository that keeps every version of it. */
export const MAX_PNG_BYTES = 400_000;
export const MAX_GIF_BYTES = 2_000_000;

export type Theme = 'light' | 'dark';

/** The same font everywhere (DejaVu Sans, which CI has too), whatever the machine's own fonts are. */
const STYLE = `
  *, *::before, *::after {
    font-family: 'DejaVu Sans', sans-serif !important;
    caret-color: transparent !important;
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
`;

/**
 * Makes a page capturable: a clean browser storage on every load (no draft, no remembered panel),
 * one font, no caret, no animation. The app asks for reduced motion through the configuration.
 */
export async function prepare(page: Page): Promise<void> {
  await page.addInitScript((css) => {
    try {
      localStorage.clear();
    } catch {
      // No storage: nothing to clear.
    }
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, STYLE);
}

/** A test whose page is prepared, for every capture. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await prepare(page);
    await use(page);
  },
});
export { expect } from '@playwright/test';

/**
 * Waits for the page to be still: fonts loaded, and the diagram's cards, positions and sizes the
 * same for several frames in a row (the layout is made asynchronously after a change).
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const state = () =>
      [...document.querySelectorAll('app-node-card, .transition, f-canvas')]
        .map((e) => {
          const r = e.getBoundingClientRect();
          return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
        })
        .join('|');
    let last = '';
    let same = 0;
    for (let i = 0; i < 120 && same < 5; i++) {
      await frame();
      const now = state();
      same = now === last ? same + 1 : 0;
      last = now;
    }
  });
}

/** Opens the editor, empty. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('app-editor').waitFor();
  await settle(page);
  // A picture with the top bar cut off is not a picture for the guide: say so, do not write it.
  const cutOff = await page.evaluate(() => {
    const bar = document.querySelector('header.topbar');
    return bar ? bar.scrollWidth > bar.clientWidth + 1 : false;
  });
  if (cutOff) throw new Error('The top bar is cut off at this window size: widen the viewport.');
}

/** **New → sample**: opens the sample with this id (`order`, `booking`, `order-fulfilment`, ...). */
export async function openSample(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  // The library is a chunk of its own, loaded when the dialog opens.
  const sample = page.locator(`.sample[data-sample-id="${id}"]`);
  await sample.waitFor();
  await sample.click();
  await page.locator('app-node-card').first().waitFor();
  // The pointer is where the sample button was: over the diagram, which then shows a hover.
  await unhover(page);
  await settle(page);
}

/** Switches the theme the way a host does, without reloading, so that what is open stays open. */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((kind) => window.postMessage({ type: 'ariadne:theme', kind }, '*'), theme);
  await page.waitForFunction(
    (kind) => document.documentElement.getAttribute('data-theme') === kind,
    theme,
  );
  await settle(page);
}

export interface ShotOptions {
  theme: Theme;
  /** A part of the page, in CSS pixels. */
  clip?: { x: number; y: number; width: number; height: number };
  /** An element to take instead of the page. */
  of?: Locator;
}

/** Writes `docs/images/guide/<name>-<theme>.png`, optimised, and fails when it is too big. */
export async function shot(page: Page, name: string, options: ShotOptions): Promise<string> {
  await setTheme(page, options.theme);
  const raw = options.of
    ? await options.of.screenshot({ animations: 'disabled', caret: 'hide' })
    : await page.screenshot({ clip: options.clip, animations: 'disabled', caret: 'hide' });
  // A palette image: a screenshot of an interface has few colours, and this is about 70% smaller.
  const png = await sharp(raw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  if (png.length > MAX_PNG_BYTES) {
    throw new Error(
      `${name}-${options.theme}.png is ${png.length} bytes, over ${MAX_PNG_BYTES}: clip it.`,
    );
  }
  mkdirSync(IMAGES, { recursive: true });
  const file = join(IMAGES, `${name}-${options.theme}.png`);
  writeFileSync(file, png);
  return file;
}

/** Both themes of the same view. */
export async function shots(page: Page, name: string, options: Omit<ShotOptions, 'theme'> = {}) {
  await shot(page, name, { ...options, theme: 'light' });
  await shot(page, name, { ...options, theme: 'dark' });
  // Leave the page as it was found.
  await setTheme(page, 'light');
}

/**
 * Records `steps` as a GIF, `docs/images/guide/<name>.gif`: a video of its own browser window (1600 ×
 * 900 at scale 1), made into a 12 fps, 960 px wide GIF with `ffmpeg`. Fails without `ffmpeg`, and when
 * the GIF is over 2 MB (shorten the steps, or the pauses).
 */
export async function gif(
  browser: Browser,
  name: string,
  steps: (page: Page) => Promise<void>,
): Promise<string> {
  const have = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (have.error || have.status !== 0) {
    throw new Error(
      'ffmpeg is needed for GIFs: install it (apt install ffmpeg, brew install ffmpeg).',
    );
  }
  const work = mkdtempSync(join(tmpdir(), 'ariadne-gif-'));
  try {
    const context = await browser.newContext({
      baseURL: 'http://localhost:' + (process.env['CAPTURE_PORT'] ?? 4310),
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      recordVideo: { dir: work, size: { width: 1600, height: 900 } },
    });
    const page = await context.newPage();
    await prepare(page);
    await steps(page);
    // Hold the last picture, then close: the video is written when the page is closed.
    await page.waitForTimeout(800);
    await context.close();

    const video = readdirSync(work).find((f) => f.endsWith('.webm'));
    if (!video) throw new Error('No video was recorded.');
    mkdirSync(IMAGES, { recursive: true });
    const out = join(IMAGES, `${name}.gif`);
    const filter =
      'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5';
    const run = spawnSync(
      'ffmpeg',
      ['-y', '-v', 'error', '-i', join(work, video), '-vf', filter, '-loop', '0', out],
      {
        encoding: 'utf8',
      },
    );
    if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
    const size = statSync(out).size;
    if (size > MAX_GIF_BYTES) {
      rmSync(out);
      throw new Error(`${name}.gif is ${size} bytes, over ${MAX_GIF_BYTES}: shorten the steps.`);
    }
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Moves the pointer off everything, so that nothing is drawn as hovered. */
export const unhover = (page: Page) => page.mouse.move(4, 880);

/** A short pause that a GIF needs to be readable (nothing else waits on it). */
export const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);
