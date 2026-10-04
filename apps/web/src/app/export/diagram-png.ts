import { pngScale } from '@ariadne/export';

export interface PngOptions {
  /**
   * Pixel ratio: 2 renders at twice the SVG's size. Less when that would be larger than a canvas can
   * be (see `pngScale`): the picture is then scaled down to fit.
   */
  scale?: number;
  /** CSS colour, or `null` for a transparent background. */
  background?: string | null;
}

export const DEFAULT_PNG_OPTIONS: Required<PngOptions> = { scale: 2, background: '#ffffff' };

/** Rasterises an SVG through `<canvas>`. Rejects if the SVG cannot be loaded or encoded. */
export async function svgToPng(
  svg: string,
  size: { width: number; height: number },
  options: PngOptions = {},
  doc: Document = document,
): Promise<Blob> {
  const { scale: wanted, background } = { ...DEFAULT_PNG_OPTIONS, ...options };
  if (!(wanted > 0)) throw new Error('PNG scale must be greater than 0.');
  const scale = pngScale(size, wanted);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(size.width * scale);
  canvas.height = Math.round(size.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available for PNG export.');
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    ),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The diagram could not be rendered to an image.'));
    image.src = src;
  });
}
