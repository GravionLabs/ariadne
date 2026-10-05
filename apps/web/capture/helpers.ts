import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    // No native file pickers: the app then reads files from an input and saves by download, which
    // a script can drive (a native dialog cannot be reached from the page).
    for (const name of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
      Object.defineProperty(window, name, { value: undefined, configurable: true });
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

/**
 * Writes `docs/images/guide/<name>.png` for something that is not the app (an exported SVG or page
 * opened in the browser): no theme, as it has none of its own to switch.
 */
export async function plainShot(
  page: Page,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const raw = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  const png = await sharp(raw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  if (png.length > MAX_PNG_BYTES) {
    throw new Error(`${name}.png is ${png.length} bytes, over ${MAX_PNG_BYTES}: clip it.`);
  }
  mkdirSync(IMAGES, { recursive: true });
  const file = join(IMAGES, `${name}.png`);
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

/** What a GIF is made of: pictures of the page that the steps ask for, each held for a while. */
export interface Frames {
  /** Takes a picture of the page now and holds it for `holdMs`. */
  frame(holdMs?: number): Promise<void>;
  /** Types `text` into `field`, a picture after every `every` characters, so that it can be watched. */
  type(field: Locator, text: string, every?: number): Promise<void>;
}

/**
 * Makes `docs/images/guide/<name>.gif` from the pictures that `steps` asks for (`frames.frame()`), in
 * a browser window of its own (1720 × 900), each held for the time given, as a 960 px wide GIF made
 * with `ffmpeg`. Pictures, not a video: a video has codec noise around every letter, which makes a
 * GIF three times bigger and different on every run. Fails without `ffmpeg`, and when the GIF is
 * over 2 MB (fewer or shorter frames).
 */
export async function gif(
  browser: Browser,
  name: string,
  steps: (page: Page, frames: Frames) => Promise<void>,
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
      viewport: { width: 1720, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await prepare(page);

    const holds: number[] = [];
    const frames: Frames = {
      async frame(holdMs = 700) {
        const file = join(work, `frame-${String(holds.length).padStart(3, '0')}.png`);
        await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
        holds.push(holdMs);
      },
      async type(field, text, every = 3) {
        for (let at = 0; at < text.length; at += every) {
          await field.pressSequentially(text.slice(at, at + every));
          await frames.frame(110);
        }
      },
    };
    await steps(page, frames);
    await context.close();
    if (holds.length < 2) throw new Error(`${name}: a GIF needs at least two frames.`);

    // The concat demuxer: a file and a duration for each frame, the last file once more.
    const list = holds
      .map((ms, i) => `file 'frame-${String(i).padStart(3, '0')}.png'\nduration ${ms / 1000}`)
      .concat(`file 'frame-${String(holds.length - 1).padStart(3, '0')}.png'`)
      .join('\n');
    writeFileSync(join(work, 'frames.txt'), list);

    mkdirSync(IMAGES, { recursive: true });
    const out = join(IMAGES, `${name}.gif`);
    const filter =
      'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3';
    const run = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        join(work, 'frames.txt'),
        '-vf',
        filter,
        '-loop',
        '0',
        out,
      ],
      { encoding: 'utf8' },
    );
    if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
    const size = statSync(out).size;
    if (size > MAX_GIF_BYTES) {
      rmSync(out);
      throw new Error(
        `${name}.gif is ${size} bytes, over ${MAX_GIF_BYTES}: fewer or shorter frames.`,
      );
    }
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Runs `work` with the window at another size, then puts it back: for a panel that scrolls in the
 * usual window and is cut off in a picture of it.
 */
export async function withViewport<T>(
  page: Page,
  size: { width: number; height: number },
  work: () => Promise<T>,
): Promise<T> {
  const before = page.viewportSize()!;
  await page.setViewportSize(size);
  await settle(page);
  try {
    return await work();
  } finally {
    await page.setViewportSize(before);
    await settle(page);
  }
}

/** Moves the pointer off everything, so that nothing is drawn as hovered. */
export const unhover = (page: Page) => page.mouse.move(4, 880);

/** A short pause that a GIF needs to be readable (nothing else waits on it). */
export const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);
