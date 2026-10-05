import { describe, expect, it } from 'vitest';
import { attributeSelector } from './selector';

describe('attributeSelector', () => {
  const find = (value: string) => {
    const host = document.createElement('div');
    for (const id of [value, `${value}x`, 'other']) {
      const el = document.createElement('span');
      el.setAttribute('data-id', id);
      host.append(el);
    }
    return host.querySelector(attributeSelector('data-id', value))?.getAttribute('data-id');
  };

  it('writes a plain value in quotes', () => {
    expect(attributeSelector('data-f-node-id', 'state-1')).toBe('[data-f-node-id="state-1"]');
  });

  it('finds an element whose value has a quote, a backslash, or both twice', () => {
    for (const value of ['say "hi"', 'a\\b', 'a\\', 'a\\"b', '""', '\\\\"', 'two\nlines']) {
      expect(find(value)).toBe(value);
    }
  });

  it('does not let a value that ends in a backslash close the string and add a selector', () => {
    const selector = attributeSelector('data-id', 'a\\');
    expect(selector).toBe('[data-id="a\\\\"]');
    expect(() => document.createElement('div').querySelector(selector)).not.toThrow();
  });
});
