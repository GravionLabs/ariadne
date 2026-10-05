// Re-captures the screenshots of the extension for docs/guide/vscode.md (and, later, the marketplace
// page): a real VS Code, driven with Playwright's Electron support, in a fresh profile, at a fixed
// size, in a light and a dark theme. On Linux without a display: `xvfb-run -a pnpm capture`.
//
//   pnpm --filter ariadne-vscode capture            (builds the extension first)
//   node capture/capture.mjs [name…]                (only these captures; the extension must be built)
//
// The window shows the `samples/sagas/order` saga, copied to a temporary folder (drift and the
// quick fix write files), with its diagram, its C#, a broken YAML file and a Markdown page.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { _electron as electron } from 'playwright';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const images = join(repo, 'docs/images/guide');

/** A pinned VS Code: the pictures change when the app does, not when VS Code updates. */
const VSCODE_VERSION = '1.140.0';
const SIZE = { width: 1440, height: 900 };
const MAX_PNG_BYTES = 400_000;

if (!existsSync(join(root, 'dist/extension.js'))) {
  console.error('Build the extension first: pnpm --filter ariadne-vscode build');
  process.exit(2);
}

const themes = { light: 'Default Light Modern', dark: 'Default Dark Modern' };

/** The settings of the capture profile: the theme, one font size, and no welcome, chat or tips. */
const settings = (theme) => ({
  'workbench.colorTheme': themes[theme],
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.welcomePage.walkthroughs.openOnInstall': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'chat.disableAIFeatures': true,
  'window.commandCenter': false,
  'window.zoomLevel': 0,
  'editor.fontSize': 14,
  'editor.minimap.enabled': false,
  'editor.stickyScroll.enabled': false,
  'editor.fontFamily': "'DejaVu Sans Mono', monospace",
  'workbench.editor.enablePreview': false,
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'extensions.ignoreRecommendations': true,
  'security.workspace.trust.enabled': false,
  'git.enabled': false,
});

/** The workspace: the order saga, its diagram, a broken diagram and a Markdown page with a saga block. */
function makeWorkspace() {
  // A folder with a name of its own: it is in the title of the window and the Explorer.
  const dir = join(mkdtempSync(join(tmpdir(), 'ariadne-capture-ws-')), 'order');
  cpSync(join(repo, 'samples/sagas/order'), dir, { recursive: true });
  const diagram = join(dir, 'OrderStateMachine.saga.yaml');
  // The diagram says where its C# is, so that the two are compared.
  writeFileSync(
    diagram,
    readFileSync(diagram, 'utf8')
      // Where each event comes from, so that the Problems panel has only what the capture is about.
      .replace(/^( {4}event: .+)$/gm, '$1\n    eventSource: Shop API')
      .replace(
        '  stateProperty: CurrentState\n',
        '  stateProperty: CurrentState\n  source: OrderStateMachine.cs\n',
      ),
  );
  // The code has moved on: a transition the diagram does not have (the drift).
  const code = join(dir, 'OrderStateMachine.cs');
  writeFileSync(
    code,
    readFileSync(code, 'utf8').replace(
      '        During(Shipping,',
      '        During(Shipping,\n            When(PaymentFailed)\n                .Finalize(),',
    ),
  );
  writeFileSync(
    join(dir, 'broken.saga.yaml'),
    'version: 3\nnodes:\n  - id: start-1\n    type: begin\n    name: Initial\nedges: []\n',
  );
  writeFileSync(
    join(dir, 'README.md'),
    '# Order saga\n\nThe saga, drawn from its diagram:\n\n```saga\n' +
      readFileSync(diagram, 'utf8') +
      '```\n',
  );
  return dir;
}

async function launch(theme, workspace) {
  const executablePath = await downloadAndUnzipVSCode({
    cachePath: join(root, '.vscode-test'),
    version: VSCODE_VERSION,
  });
  const profile = mkdtempSync(join(tmpdir(), 'ariadne-capture-profile-'));
  mkdirSync(join(profile, 'User'), { recursive: true });
  writeFileSync(join(profile, 'User/settings.json'), JSON.stringify(settings(theme), null, 2));
  const app = await electron.launch({
    executablePath,
    args: [
      `--extensionDevelopmentPath=${root}`,
      `--user-data-dir=${profile}`,
      `--extensions-dir=${join(profile, 'extensions')}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      '--no-sandbox',
      workspace,
    ],
  });
  const window = await app.firstWindow();
  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  // A window of a known size, in the corner, whatever the display is.
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ x: 0, y: 0, width: size.width, height: size.height });
  }, SIZE);
  await window.waitForTimeout(1500);
  return { app, window, profile };
}

// ---- what the captures do in the window

/** Runs a command from the Command Palette. */
async function command(window, title) {
  await window.keyboard.press('F1');
  const input = window.locator('.quick-input-widget input');
  await input.waitFor();
  await input.fill(`>${title}`);
  await window.locator('.quick-input-list .monaco-list-row', { hasText: title }).first().waitFor();
  await window.keyboard.press('Enter');
}

/** Opens a file of the Explorer (a single click: previews are off, so it stays open). */
async function open(window, name, { toTheSide = false } = {}) {
  const item = window.locator('.explorer-folders-view .monaco-list-row', { hasText: name }).first();
  // Alt+click opens to the side of the editor that is open, without opening it here first.
  await item.click(toTheSide ? { modifiers: ['Alt'] } : {});
  await window.waitForTimeout(400);
}

/** The frame of a webview that has this selector: the diagram editor, or the Markdown preview. */
async function inWebview(window, selector, timeout = 30_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const frame of window.frames()) {
      if (
        (await frame
          .locator(selector)
          .count()
          .catch(() => 0)) > 0
      )
        return frame;
    }
    await window.waitForTimeout(250);
  }
  throw new Error(`Nothing showed ${selector} in ${timeout} ms.`);
}

/** The window, written as `docs/images/guide/vscode-<name>-<theme>.png`. */
async function shot(window, name, theme) {
  const raw = await window.screenshot();
  const png = await sharp(raw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  if (png.length > MAX_PNG_BYTES)
    throw new Error(`vscode-${name}-${theme}.png is ${png.length} bytes: over ${MAX_PNG_BYTES}.`);
  mkdirSync(images, { recursive: true });
  writeFileSync(join(images, `vscode-${name}-${theme}.png`), png);
}

/** The diagram editor's own "Fit to screen", for a pane that was narrower when it drew. */
async function fit(window, frame) {
  await frame.locator('[aria-label="Fit to screen"]').click();
  await window.waitForTimeout(600);
}

/**
 * Saves the C# with a change, which is what makes the extension compare it with its diagram (it does
 * so when either is saved): the drift shows in the Problems panel on both files.
 */
async function saveCode(window) {
  await open(window, 'OrderStateMachine.cs');
  await window.locator('.monaco-editor .view-lines').first().click();
  await window.keyboard.press('Control+End');
  await window.keyboard.press('Enter');
  await window.keyboard.press('Control+s');
  await window.waitForTimeout(1500);
}

const hideSidebar = (window) => command(window, 'View: Toggle Primary Side Bar Visibility');

const clean = async (window) => {
  await window.keyboard.press('Escape');
  await command(window, 'View: Close All Editors');
  await command(window, 'View: Close Panel').catch(() => {});
};

/** The captures: a name and what to do in the window before it is taken. */
const captures = {
  async 'editor-and-code'(window) {
    await open(window, 'OrderStateMachine.saga.yaml');
    const frame = await inWebview(window, 'app-node-card');
    await open(window, 'OrderStateMachine.cs', { toTheSide: true });
    // Room for both: the Explorer has done its work.
    await hideSidebar(window);
    await window.waitForTimeout(600);
    await fit(window, frame);
  },

  async problems(window) {
    // A broken diagram (opened as text) and the order diagram, which has drifted from its C#.
    await open(window, 'broken.saga.yaml');
    await saveCode(window);
    await command(window, 'View: Focus Problems');
    await window
      .locator('.markers-panel .monaco-list-row', { hasText: 'broken.saga.yaml' })
      .first()
      .waitFor();
    await window
      .locator('.markers-panel .monaco-list-row', { hasText: 'OrderStateMachine.cs' })
      .first()
      .waitFor();
    await window.waitForTimeout(500);
  },

  async 'drift-quick-fix'(window) {
    await saveCode(window);
    // To the first problem of the file (the drift), and its quick fixes.
    await window.keyboard.press('F8');
    await window.waitForTimeout(600);
    await window.keyboard.press('Escape');
    await window.keyboard.press('Control+.');
    await window
      .locator('.action-widget .monaco-list-row', { hasText: 'Update diagram from code' })
      .first()
      .waitFor();
  },

  async 'markdown-preview'(window) {
    await open(window, 'README.md');
    await command(window, 'Markdown: Open Preview to the Side');
    await inWebview(window, 'figure.ariadne-saga');
    await window.waitForTimeout(800);
  },

  async 'export-quick-pick'(window) {
    await open(window, 'OrderStateMachine.saga.yaml');
    const frame = await inWebview(window, 'app-node-card');
    await hideSidebar(window);
    await fit(window, frame);
    await command(window, 'Ariadne: Export Diagram');
    await window.locator('.quick-input-list .monaco-list-row').first().waitFor();
    await window.waitForTimeout(500);
  },
};

// ---- run

const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !(n in captures));
if (unknown.length) {
  console.error(
    `No such capture: ${unknown.join(', ')}. Captures: ${Object.keys(captures).join(', ')}`,
  );
  process.exit(2);
}

let failed = false;
for (const theme of Object.keys(themes)) {
  const workspace = makeWorkspace();
  for (const [name, run] of Object.entries(captures)) {
    if (wanted.length && !wanted.includes(name)) continue;
    // A VS Code of its own for each: what one leaves open cannot show in the next.
    const { app, window, profile } = await launch(theme, workspace);
    try {
      await run(window);
      await shot(window, name, theme);
      console.log(`captured vscode-${name}-${theme}`);
    } catch (e) {
      failed = true;
      console.error(`FAILED vscode-${name}-${theme}: ${e.message}`);
      mkdirSync(join(root, 'capture/failures'), { recursive: true });
      await window
        .screenshot({ path: join(root, `capture/failures/${name}-${theme}.png`) })
        .catch(() => {});
    } finally {
      await app.close().catch(() => {});
      rmSync(profile, { recursive: true, force: true });
    }
  }
  rmSync(dirname(workspace), { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
