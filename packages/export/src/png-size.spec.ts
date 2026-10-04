import { MAX_PNG_SIDE, pngScale } from './png-size';

describe('pngScale', () => {
  it('keeps the wanted ratio for a diagram of the usual size', () => {
    expect(pngScale({ width: 1200, height: 3000 })).toBe(2);
    expect(pngScale({ width: 800, height: 600 }, 3)).toBe(3);
  });

  it('keeps it up to exactly the longest side allowed', () => {
    expect(pngScale({ width: 500, height: MAX_PNG_SIDE / 2 })).toBe(2);
  });

  it('shrinks the ratio so that the longest side fits, whichever side it is', () => {
    expect(pngScale({ width: 1992, height: 37_029 })).toBeCloseTo(MAX_PNG_SIDE / 37_029);
    expect(pngScale({ width: 37_029, height: 1992 })).toBeCloseTo(MAX_PNG_SIDE / 37_029);
    const size = { width: 3291, height: 73_761 };
    expect(Math.round(size.height * pngScale(size))).toBeLessThanOrEqual(MAX_PNG_SIDE);
  });

  it('can go below 1: the picture is scaled down, not cut off', () => {
    expect(pngScale({ width: 100, height: 4 * MAX_PNG_SIDE })).toBeCloseTo(0.25);
  });

  it('copes with an empty size', () => {
    expect(pngScale({ width: 0, height: 0 })).toBe(2);
  });
});
