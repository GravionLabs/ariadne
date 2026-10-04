/**
 * The longest side of a PNG, in pixels. A browser's canvas cannot be bigger (Chrome and Firefox stop
 * at 16 384, and draw nothing or fail beyond it), and nobody can open a much bigger picture; a
 * saga of 150 states drawn in a line is 37 000 px tall, 300 states 74 000 px.
 */
export const MAX_PNG_SIDE = 16_384;

/**
 * The pixel ratio to draw an SVG of `size` with: `wanted` (2 for a sharp image), or less when that
 * would make a side longer than {@link MAX_PNG_SIDE}. A diagram that large is scaled to fit instead
 * of failing or taking minutes to draw; for the details, export the SVG.
 */
export function pngScale(size: { width: number; height: number }, wanted = 2): number {
  const longest = Math.max(size.width, size.height);
  return longest > 0 ? Math.min(wanted, MAX_PNG_SIDE / longest) : wanted;
}
