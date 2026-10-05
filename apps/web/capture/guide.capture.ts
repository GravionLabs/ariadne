import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Locator, Page } from '@playwright/test';
import MarkdownIt from 'markdown-it';
import {
  gif,
  openApp,
  openSample,
  plainShot,
  settle,
  shots,
  test,
  unhover,
  withViewport,
} from './helpers';

/**
 * The images of the user guide, one test for each, named after the image (`docs/images/guide/<name>-
 * light.png` and `-dark.png`, or `<name>.gif`). The pages that use them are in docs/guide.
 */
const repo = resolve(__dirname, '../../..');

const card = (page: Page, text: string): Locator =>
  page.locator('app-node-card', { hasText: text });
const selectState = async (page: Page, text: string) => {
  await card(page, text).first().click();
  await page.locator('app-inspector').waitFor();
  await unhover(page);
  await settle(page);
};
/**
 * Selects the transition that leads into a state, as a keyboard user does: select the state, then
 * Ctrl+Up (f-flow walks to the connection in that direction and selects it). Clicking the line is
 * unreliable: the "+" of the transition, which opens the picker, sits right on it.
 */
const selectTransitionInto = async (page: Page, state: Locator) => {
  await state.first().click();
  await page.keyboard.press('Control+ArrowUp');
  await page.locator('app-inspector input[placeholder^="e.g. PaymentCharged"]').waitFor();
};
/** A field of the inspector, by its label. */
const field = (page: Page, label: string) =>
  page.locator('app-inspector label.field', { hasText: label }).locator('input, textarea').first();

// ---- getting-started.md

test('new-dialog', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.locator('#samples-library').waitFor();
  // Taller than the usual window: the dialog scrolls there, and the last sample would be cut in two.
  await withViewport(page, { width: 1600, height: 1150 }, async () => {
    await unhover(page);
    await shots(page, 'new-dialog', { of: page.locator('dialog[open] .dialog') });
  });
});

test('order-inspector', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await selectState(page, 'Charging payment');
  await shots(page, 'order-inspector');
});

test('draw-a-saga', async ({ browser }) => {
  await gif(browser, 'draw-a-saga', async (page, frames) => {
    await openApp(page);
    await frames.frame(900);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await frames.frame(500);
    await frames.type(page.locator('dialog[open] input[type=text]'), 'Order Saga', 4);
    await frames.frame(500);
    await page.locator('dialog[open] button[type=submit]').click();
    await settle(page);
    await unhover(page);
    await frames.frame(800);

    // The first state, after the initial one: its "+", then the kind of state.
    await page.locator('.slot [aria-label="Add the next state"]').click();
    await page.locator('.cdk-overlay-container .option[data-type="state"]').click();
    await settle(page);
    await field(page, 'Name').fill('');
    await frames.type(field(page, 'Name'), 'Reserving stock', 5);
    await field(page, 'Name').press('Tab');
    await settle(page);
    await frames.frame(900);

    // A second one, and the event of the transition between them.
    await page.locator('.slot [aria-label="Add the next state"]').click();
    await page.locator('.cdk-overlay-container .option[data-type="state"]').click();
    await settle(page);
    await frames.frame(600);
    // A transition without an event has nothing but its "+" in the label: select it by keyboard.
    await selectTransitionInto(page, card(page, 'State').last());
    await frames.frame(700);
    const event = page.locator('app-inspector input[placeholder^="e.g. PaymentCharged"]');
    await frames.type(event, 'StockReserved', 5);
    await event.press('Tab');
    await settle(page);
    await frames.frame(1500);
  });
});

// ---- modelling.md

test('state-activities', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await selectState(page, 'Charging payment');
  await withViewport(page, { width: 1600, height: 1200 }, async () => {
    await unhover(page);
    await shots(page, 'state-activities', { of: page.locator('app-inspector') });
  });
});

test('external-event', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  // The label of the transition: its text, not its "+" (the picker for a state inserted in it).
  await page
    .locator('app-transition-label', { hasText: 'PaymentCharged' })
    .first()
    .click({ position: { x: 14, y: 10 } });
  await page.locator('app-inspector input[placeholder^="e.g. PaymentCharged"]').waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'external-event');
});

test('compensation', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await selectState(page, 'Reserving stock');
  // Open the section "Recovery" (it is open already when the state has a compensation: leave it).
  const recovery = page.locator('app-inspector [aria-label="Recovery"] .group-toggle');
  if ((await recovery.getAttribute('aria-expanded')) === 'false') await recovery.click();
  await withViewport(page, { width: 1600, height: 1200 }, async () => {
    await unhover(page);
    await shots(page, 'compensation');
  });
});

test('any-and-join', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'travel-booking');
  // The whole saga is too small to read. Zoom in with the wheel on the spot between the Any state
  // and the join, so that both are in the picture.
  const where = async (text: string) => (await card(page, text).first().boundingBox())!;
  const [any, join] = [await where('Any state'), await where('BookingReady')];
  await page.mouse.move((any.x + join.x) / 2 + 100, (any.y + join.y) / 2 + 40);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
  await unhover(page);
  await settle(page);
  await shots(page, 'any-and-join');
});

// ---- the source, the walkthrough and the path

test('source-error', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await page.locator('.source-toggle').click();
  const text = page.locator('app-source-panel .cm-content');
  await text.waitFor();
  // Break the YAML near the top, where it shows: a direction that is not one.
  await page.locator('app-source-panel .cm-line', { hasText: 'direction:' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('wards');
  // Back to the start of the line: the editor scrolls sideways to follow the cursor.
  await page.keyboard.press('Home');
  await page.locator('app-source-panel .status[data-kind="error"]').waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'source-error');
});

test('walkthrough', async ({ browser }) => {
  await gif(browser, 'walkthrough', async (page, frames) => {
    await openApp(page);
    await openSample(page, 'order');
    await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
    await page.locator('app-walkthrough-panel .option').first().waitFor();
    await unhover(page);
    await settle(page);
    await frames.frame(1200);
    // Three steps: the first way on each time.
    for (let step = 0; step < 3; step++) {
      await page.locator('app-walkthrough-panel .option').first().click();
      await settle(page);
      await unhover(page);
      await frames.frame(step === 2 ? 1800 : 1200);
    }
  });
});

test('path-panel', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await page.getByRole('button', { name: 'Path', exact: true }).click();
  const box = page.locator('app-path-panel textarea');
  // The second PaymentFailed has two ways on (a guard on each), so the step says which: `to`.
  await box.fill(
    '- OrderReceived\n- StockReserved\n- event: PaymentFailed\n  to: Charging payment\n- PaymentCharged\n- OrderShipped',
  );
  // The path moves the view to where it ends: show the whole saga.
  await page.locator('[aria-label="Fit to screen"]').click();
  await unhover(page);
  await settle(page);
  await shots(page, 'path-panel');
});

// ---- import-and-generate.md

test('import-dialog', async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import C#/ }).click();
  await (await chooser).setFiles(join(repo, 'samples/sagas/order/OrderStateMachine.cs'));
  await page.locator('dialog[open]').waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'import-dialog', { of: page.locator('dialog[open]') });
});

test('generate-dialog', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await page.getByRole('button', { name: /Generate C#/ }).click();
  await page.locator('dialog[open]').waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'generate-dialog', { of: page.locator('dialog[open]') });
});

// ---- exports.md

test('export-menu', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await page.locator('app-export-menu button').click();
  await page.locator('.cdk-overlay-pane [role=menuitem]').first().waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'export-menu');
});

/** Exports through the menu, as the browser does without a file picker: a download. */
async function exportTo(page: Page, label: string, name: string): Promise<string> {
  await page.locator('app-export-menu button').click();
  const download = page.waitForEvent('download');
  await page.locator('.cdk-overlay-pane [role=menuitem]', { hasText: label }).first().click();
  const file = join(mkdtempSync(join(tmpdir(), 'ariadne-export-')), name);
  await (await download).saveAs(file);
  return file;
}

test('exported-svg', async ({ page, context }) => {
  await openApp(page);
  await openSample(page, 'order');
  const file = await exportTo(page, 'SVG', 'order.svg');
  // The file as a browser shows it.
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 1000, height: 900 });
  await viewer.goto(`file://${file}`);
  // The picture is as big as the saga: fit it to the window, as an image in a page would be.
  await viewer.evaluate(() => {
    document.documentElement.setAttribute('width', '100%');
    document.documentElement.setAttribute('height', '100%');
  });
  await plainShot(viewer, 'exported-svg');
});

test('exported-markdown', async ({ page, context }) => {
  await openApp(page);
  await openSample(page, 'order');
  const file = await exportTo(page, 'Markdown page', 'order.docs.md');
  // The page as a document: the Mermaid block is code here (GitHub would draw it), the tables are tables.
  const html = new MarkdownIt({ html: true }).render(readFileSync(file, 'utf8'));
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 1500, height: 820 });
  await viewer.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { font: 15px/1.5 'DejaVu Sans', sans-serif; margin: 24px 32px; color: #1f2328; max-width: 1400px }
    h1, h2 { border-bottom: 1px solid #d0d7de; padding-bottom: 4px } table { border-collapse: collapse }
    td, th { border: 1px solid #d0d7de; padding: 3px 8px; font-size: 13px } th { background: #f6f8fa } code, pre { font-size: 12px; background: #f6f8fa }
    pre { padding: 12px; overflow: hidden; max-height: 220px }</style>${html}`);
  await plainShot(viewer, 'exported-markdown');
});

test('problems-menu', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await page.locator('app-problems-menu button').click();
  await page.locator('.cdk-overlay-pane').waitFor();
  await unhover(page);
  await settle(page);
  await shots(page, 'problems-menu');
});

// ---- the README

test('hero', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await shots(page, 'hero');
});
