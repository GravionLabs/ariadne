import { describe, expect, it } from 'vitest';
import { readSource } from '../testing/read-source';
import { SHORTCUT_GROUPS, keyParts } from './shortcuts';

/** The rows of the table in the guide, as plain text: `keys → does`. */
function guideRows(): string[] {
  const plain = (cell: string) => cell.replaceAll('`', '').trim();
  return readSource('../../docs/guide/shortcuts.md')
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*(Keys|-)/.test(line))
    .map((line) => {
      const [keys, does] = line.split(/(?<!\\)\|/).slice(1, 3);
      return `${plain(keys)} → ${plain(does)}`;
    });
}

describe('the shortcuts of the "?" dialog', () => {
  it('are the shortcuts of docs/guide/shortcuts.md, no more and no fewer', () => {
    const app = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts).map((s) => `${s.keys} → ${s.does}`);
    expect([...app].sort()).toEqual(guideRows().sort());
  });

  it('have no duplicate keys', () => {
    const keys = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts).map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('split alternatives into caps, and leave a sentence as text', () => {
    expect(keyParts('Ctrl+Shift+Z, Ctrl+Y')).toEqual([
      { text: 'Ctrl+Shift+Z', cap: true },
      { text: 'Ctrl+Y', cap: true },
    ]);
    expect(keyParts('Enter on a "+" button')).toEqual([
      { text: 'Enter on a "+" button', cap: false },
    ]);
  });
});
