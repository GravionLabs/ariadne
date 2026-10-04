import { compositeOver, contrastRatio, parseColor, relativeLuminance } from './color';

describe('parseColor', () => {
  it('reads short and long hex, rgb() and rgba()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#6366F1')).toEqual({ r: 99, g: 102, b: 241, a: 1 });
    expect(parseColor('rgb(0, 128, 255)')).toEqual({ r: 0, g: 128, b: 255, a: 1 });
    expect(parseColor('rgba(139, 147, 248, 0.16)')).toEqual({ r: 139, g: 147, b: 248, a: 0.16 });
    expect(parseColor('  #000000 ')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('refuses what it does not understand, instead of guessing', () => {
    for (const value of [
      'red',
      'var(--c-text)',
      'color-mix(in srgb, red, white)',
      '#12',
      '#1234567',
    ]) {
      expect(() => parseColor(value), value).toThrow('Not a colour this can read');
    }
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('weights green above red above blue', () => {
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('refuses a translucent colour', () => {
    expect(() => relativeLuminance(parseColor('rgba(0,0,0,0.5)'))).toThrow('translucent');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, either way round, and 1 for the same colour', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#6366f1', '#6366f1')).toBe(1);
  });

  it('matches known pairs: #767676 is the lightest grey on white that passes AA for text', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.5422, 3);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.4781, 3);
    expect(contrastRatio('#6366f1', '#ffffff')).toBeCloseTo(4.4669, 3);
    expect(contrastRatio('#1a1c23', '#f4f5f7')).toBeCloseTo(15.5965, 3);
  });

  it('lays a translucent foreground over the background first', () => {
    // Half-opaque black on white is the grey #808080 (128), 3.95:1 on white.
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(
      contrastRatio('#808080', '#ffffff'),
      6,
    );
    expect(contrastRatio('rgba(255, 255, 255, 0)', '#000000')).toBe(1);
  });

  it('refuses a translucent background', () => {
    expect(() => contrastRatio('#000', 'rgba(255,255,255,0.5)')).toThrow('opaque');
  });
});

describe('compositeOver', () => {
  it('mixes by opacity, per channel', () => {
    expect(compositeOver(parseColor('rgba(100, 0, 200, 0.5)'), parseColor('#ffffff'))).toEqual({
      r: 178,
      g: 128,
      b: 228,
      a: 1,
    });
  });
});
