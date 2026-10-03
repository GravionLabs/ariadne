import { minimalChange } from './code-editor';

describe('minimalChange', () => {
  /** Applies the change, to check it really turns `from` into `to`. */
  const apply = (from: string, to: string) => {
    const c = minimalChange(from, to);
    return from.slice(0, c.from) + c.insert + from.slice(c.to);
  };

  it('keeps everything outside the part that changed', () => {
    expect(minimalChange('name: Initial\nkind: a', 'name: Begin\nkind: a')).toEqual({
      from: 6,
      to: 13,
      insert: 'Begin',
    });
  });

  it('inserts and deletes', () => {
    expect(minimalChange('ab', 'axb')).toEqual({ from: 1, to: 1, insert: 'x' });
    expect(minimalChange('axb', 'ab')).toEqual({ from: 1, to: 2, insert: '' });
  });

  it('handles empty text and identical text', () => {
    expect(minimalChange('', 'abc')).toEqual({ from: 0, to: 0, insert: 'abc' });
    expect(minimalChange('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
    expect(minimalChange('abc', 'abc')).toEqual({ from: 3, to: 3, insert: '' });
  });

  it.each([
    ['aaa', 'aa'],
    ['aa', 'aaa'],
    ['abcabc', 'abcxabc'],
    ['one\ntwo\nthree', 'one\nthree'],
  ])('turns %j into %j', (from, to) => {
    expect(apply(from, to)).toBe(to);
  });
});
