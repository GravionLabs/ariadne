import { contrastFailures, resolveTokens } from './contrast';

describe('resolveTokens', () => {
  it('follows var() references, also through several', () => {
    expect(
      resolveTokens({ '--a': '#111111', '--b': 'var(--a)', '--c': 'var(--b)', '--d': ' #222222 ' }),
    ).toEqual({ '--a': '#111111', '--b': '#111111', '--c': '#111111', '--d': '#222222' });
  });

  it('refuses a reference to nothing, and a loop', () => {
    expect(() => resolveTokens({ '--a': 'var(--missing)' })).toThrow('No token --missing');
    expect(() => resolveTokens({ '--a': 'var(--b)', '--b': 'var(--a)' })).toThrow('loop');
  });
});

describe('contrastFailures', () => {
  const tokens = { '--text': '#767676', '--faint': '#777777', '--bg': '#ffffff' };

  it('is empty when every pair is enough', () => {
    expect(contrastFailures('light', tokens, [['--text', '--bg', 4.5]])).toEqual([]);
  });

  it('names the pairs that are not, with the ratio cut to one decimal', () => {
    expect(
      contrastFailures('light', tokens, [
        ['--text', '--bg', 4.5],
        ['--faint', '--bg', 4.5],
        ['--text', '--bg', 7],
      ]),
    ).toEqual(['light: --faint on --bg (4.4)', 'light: --text on --bg (4.5)']);
  });

  it('fails the check itself for a token that is not there', () => {
    expect(() => contrastFailures('dark', tokens, [['--nope', '--bg', 3]])).toThrow(
      'no token --nope',
    );
  });
});
