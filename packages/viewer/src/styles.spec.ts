import { contrastFailures, type ContrastPair } from '@ariadne/core/testing';
import { DARK } from './styles';

describe('the dark colours of the viewer (WCAG 2.2 AA)', () => {
  /** `--ariadne-text: #e8eaf0;` and the rest of the block. */
  const tokens = Object.fromEntries(
    [...DARK.matchAll(/--ariadne-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const accents = [
    'start',
    'step',
    'decision',
    'any',
    'timeout',
    'reply',
    'composite',
    'join',
    'fault',
    'end',
    'compensation',
    'command',
    'event',
    'external',
    'emphasis',
    'path',
    ...['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'].map(
      (n) => `palette-${n}`,
    ),
  ];
  const pairs: ContrastPair[] = [
    // 1.4.3: text on the ground and on the cards.
    ...['text', 'text-subtle'].flatMap((text) =>
      ['bg', 'surface'].map((ground): ContrastPair => [text, ground, 4.5]),
    ),
    ['on-path', 'path', 4.5],
    // 1.4.11: the line of a transition, the focus ring, and the accents drawn on the cards.
    ['line', 'surface', 3],
    ['focus', 'surface', 3],
    ['focus', 'bg', 3],
    ...accents.map((accent): ContrastPair => [accent, 'surface', 3]),
  ];

  /** Pairs that are allowed to fail: none. A pair that fails is fixed, not listed. */
  const KNOWN_FAILURES: string[] = [];

  it('reads the dark block', () => {
    expect(tokens['bg']).toBe('#14161c');
    expect(tokens['palette-pink']).toBe('#f472b6');
  });

  it('has the pairs that are not enough, and no others', () => {
    expect(contrastFailures('viewer dark', tokens, pairs).sort()).toEqual(
      [...KNOWN_FAILURES].sort(),
    );
  });

  it('checks every colour of the block', () => {
    const covered = new Set(pairs.flat().filter((x) => typeof x === 'string'));
    const unchecked = Object.keys(tokens).filter(
      (n) => !covered.has(n) && n !== 'color-scheme' && n !== 'border',
    );
    expect(unchecked).toEqual([]);
  });
});
