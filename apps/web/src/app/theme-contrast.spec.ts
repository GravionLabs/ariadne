import { contrastFailures, resolveTokens, type ContrastPair } from '@ariadne/core/testing';
import { readSource } from './testing/read-source';

const styles = readSource('src/styles.scss');

/**
 * WCAG 2.2 AA for the colours of the themes, checked on the tokens of `styles.scss` itself, because
 * jsdom cannot compute contrast: 1.4.3 (text, 4.5:1) and 1.4.11 (parts of the interface and
 * graphics, 3:1). The three sets are the light one (`:root`), the dark one and the high-contrast one.
 *
 * Not checked: `:root[data-host='vscode']`, whose colours come from the VS Code workbench and are
 * only known in VS Code. `theme.spec.ts` checks that VS Code's high-contrast themes get the
 * high-contrast set here.
 */

/** `--name: value` declarations of a block, `//` comments left out. */
function declarations(block: string): Record<string, string> {
  const code = block.replace(/\/\/.*$/gm, '');
  return Object.fromEntries(
    [...code.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

/** The text between the braces after `start`, which opens the block. */
function blockAfter(start: string): string {
  const open = styles.indexOf('{', styles.indexOf(start));
  let depth = 0;
  for (let i = open; i < styles.length; i++) {
    if (styles[i] === '{') depth++;
    else if (styles[i] === '}' && --depth === 0) return styles.slice(open + 1, i);
  }
  throw new Error(`No block after ${start}`);
}

const light = declarations(blockAfter('// Design tokens'));
const dark = declarations(blockAfter('@mixin dark-tokens'));
// The high-contrast set includes the dark one and then overrides it.
const highContrast = { ...dark, ...declarations(blockAfter('@mixin high-contrast-tokens')) };

/** What a theme looks like: the light tokens, with the theme's own on top (`:root` is the base). */
const THEMES = {
  light: resolveTokens(light),
  dark: resolveTokens({ ...light, ...dark }),
  'high-contrast': resolveTokens({ ...light, ...highContrast }),
};

const GROUNDS = ['--c-bg', '--c-surface-1', '--c-surface-2', '--c-surface-3'];
const ACCENTS = [
  '--c-start',
  '--c-step',
  '--c-decision',
  '--c-end',
  '--c-any',
  '--c-timeout',
  '--c-reply',
  '--c-join',
  '--c-fault',
  '--c-compensation',
  '--c-command',
  '--c-event',
  '--c-external',
  ...['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'].map(
    (n) => `--c-node-${n}`,
  ),
];

/** The pairs that have to hold in every theme. */
const PAIRS: ContrastPair[] = [
  // 1.4.3: text on every ground it is set on.
  ...['--c-text', '--c-text-subtle'].flatMap((text) =>
    GROUNDS.map((ground): ContrastPair => [text, ground, 4.5]),
  ),
  ['--c-on-primary', '--c-primary', 4.5],
  // 1.4.3: the colours used for text that says something is wrong.
  ...['--c-error', '--c-danger', '--c-warning'].map((c): ContrastPair => [c, '--c-surface-1', 4.5]),
  // 1.4.11: what marks the interface (the focus ring, the border of a field, the main colour).
  ...['--c-primary', '--c-focus', '--c-border-muted'].flatMap((part) =>
    ['--c-surface-1', '--c-bg'].map((ground): ContrastPair => [part, ground, 3]),
  ),
  // 1.4.11: the accents of states, messages and nodes, drawn on the cards.
  ...ACCENTS.map((accent): ContrastPair => [accent, '--c-surface-1', 3]),
];

/**
 * The pairs that are allowed to fail: none. A pair that fails is fixed (the token is adjusted in
 * `styles.scss`, and in `COLORS` of the export and `DARK` of the viewer), not listed here.
 */
const KNOWN_FAILURES: string[] = [];

describe('the colours of the themes (WCAG 2.2 AA)', () => {
  it('reads the three token sets of styles.scss', () => {
    expect(THEMES.light['--c-bg']).toBe('#f4f5f7');
    expect(THEMES.dark['--c-bg']).toBe('#14161c');
    expect(THEMES['high-contrast']['--c-bg']).toBe('#000000');
    // A token that points at another is compared by the colour it ends up as.
    expect(light['--c-focus']).toBe('var(--c-primary)');
    expect(THEMES.dark['--c-focus']).toBe(THEMES.dark['--c-primary']);
    expect(THEMES['high-contrast']['--c-focus']).toBe('#ffd60a');
  });

  it('has the pairs that are not enough, and no others', () => {
    const failures = Object.entries(THEMES).flatMap(([name, tokens]) =>
      contrastFailures(name, tokens, PAIRS),
    );
    expect(failures.sort()).toEqual([...KNOWN_FAILURES].sort());
  });
});
