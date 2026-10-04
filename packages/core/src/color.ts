/** A colour as red, green and blue in 0–255 and opacity in 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Reads `#rgb`, `#rrggbb`, `rgb(r, g, b)` and `rgba(r, g, b, a)`. Throws for anything else (a
 * `var()`, a name, `color-mix`), so a check never compares a colour it did not understand.
 */
export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    const n = parseInt(digits, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    text,
  );
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  throw new Error(`Not a colour this can read: ${value}`);
}

/** `foreground` laid over an opaque `background`, as the eye sees it. */
export function compositeOver(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a;
  const mix = (f: number, b: number) => Math.round(f * a + b * (1 - a));
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

/** WCAG 2.2 relative luminance of an opaque colour: 0 for black, 1 for white. */
export function relativeLuminance(color: string | Rgba): number {
  const { r, g, b, a } = typeof color === 'string' ? parseColor(color) : color;
  if (a !== 1)
    throw new Error(
      'A translucent colour has no luminance of its own: compose it over a background first',
    );
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 2.2 contrast ratio of two colours, from 1 (the same) to 21 (black on white), whichever is
 * lighter. A translucent `foreground` is laid over `background`, which must be opaque.
 */
export function contrastRatio(foreground: string, background: string): number {
  const back = parseColor(background);
  if (back.a !== 1) throw new Error(`The background must be opaque: ${background}`);
  const front = compositeOver(parseColor(foreground), back);
  const [lighter, darker] = [relativeLuminance(front), relativeLuminance(back)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}
