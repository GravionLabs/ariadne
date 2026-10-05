import { describe, expect, it } from 'vitest';
import { diagramAlternative, describeDiagram } from './describe';
import { diagramToMermaid } from './mermaid';
import { replaceLineBreaks, trimChar } from './text';

/** A small seeded generator: the same strings on every run. */
function strings(alphabet: string[], count: number, maxLength: number): string[] {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: count }, () =>
    Array.from(
      { length: Math.floor(next() * maxLength) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    ).join(''),
  );
}

/** Long enough that a quadratic pattern needs seconds, and a linear one a few milliseconds. */
const LONG = 100_000;
const quick = (run: () => unknown) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

describe('replaceLineBreaks', () => {
  it('replaces a run of whitespace that holds a line break, and leaves the others', () => {
    expect(replaceLineBreaks('a \n b', ' ')).toBe('a b');
    expect(replaceLineBreaks('a  b', '<br>')).toBe('a  b');
    expect(replaceLineBreaks('a\r\n\r\nb\tc', '<br>')).toBe('a<br>b\tc');
    expect(replaceLineBreaks('\n', '-')).toBe('-');
    expect(replaceLineBreaks('', '-')).toBe('');
  });

  it('gives what /\\s*\\n\\s*/g gave, for any mix of spaces, tabs, returns, line breaks and letters', () => {
    for (const s of strings([' ', '\t', '\r', '\n', 'a', 'b'], 2000, 24)) {
      expect(replaceLineBreaks(s, '<br>')).toBe(s.replace(/\s*\n\s*/g, '<br>'));
    }
  });

  it('is fast on a long run of spaces with no line break', () => {
    expect(quick(() => replaceLineBreaks(' '.repeat(LONG) + 'x', ' '))).toBeLessThan(500);
  });
});

describe('trimChar', () => {
  it('trims the character at both ends and nowhere else', () => {
    expect(trimChar('__a_b__', '_')).toBe('a_b');
    expect(trimChar('___', '_')).toBe('');
    expect(trimChar('', '_')).toBe('');
    expect(trimChar('a', '_')).toBe('a');
  });

  it('gives what /^_+|_+$/g gave', () => {
    for (const s of strings(['_', 'a', 'b', ' '], 2000, 20)) {
      expect(trimChar(s, '_')).toBe(s.replace(/^_+|_+$/g, ''));
    }
  });

  it('is fast on a long run of the character before another one', () => {
    expect(quick(() => trimChar('_'.repeat(LONG) + 'x_', '_'))).toBeLessThan(500);
  });
});

describe('the exports on long text', () => {
  const nodes = [
    { id: 'a', type: 'start' as const, name: 'Initial' },
    { id: 'b', type: 'state' as const, name: '_'.repeat(LONG) + 'x' },
  ];
  const diagram = {
    direction: 'top-bottom' as const,
    description: ' '.repeat(LONG) + 'x',
    nodes,
    edges: [
      {
        id: 'e',
        source: 'a',
        target: 'b',
        kind: 'forward' as const,
        event: ' '.repeat(LONG) + 'go',
      },
    ],
  };

  it('describe, and the Mermaid export, take no time with a long run of spaces or underscores', () => {
    expect(quick(() => diagramAlternative(diagram))).toBeLessThan(1000);
    expect(quick(() => describeDiagram(diagram))).toBeLessThan(1000);
    expect(quick(() => diagramToMermaid(diagram))).toBeLessThan(1000);
  });
});
