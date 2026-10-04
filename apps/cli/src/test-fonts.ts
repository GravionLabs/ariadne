import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { PNG_FONTS } from './cli';

/** The fonts the build copies next to the script, taken from the package they come from. */
export const testFonts = (): string[] => {
  const fonts = dirname(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json'));
  return PNG_FONTS.map((f) => `${fonts}/ttf/${f}`);
};
