import { listFiles, readSource } from './testing/read-source';

/**
 * The images of the user guide (docs/images/guide, written by `pnpm --filter @ariadne/web capture`)
 * and the pages that show them: nothing is missing, nothing is left over, everything has an
 * alternative text, and the whole stays small enough for a repository that keeps every version.
 */
const IMAGES = '../../docs/images/guide';
const PAGES = [
  '../../README.md',
  ...listFiles('../../docs/guide')
    .filter((f) => f.name.endsWith('.md'))
    .map((f) => `../../docs/guide/${f.name}`),
];

const MAX_PNG = 400_000;
const MAX_GIF = 2_000_000;
const MAX_ALL = 15_000_000;

interface Use {
  page: string;
  /** The file name inside docs/images/guide. */
  file: string;
  alt: string | null;
}

/** Every use of an image of the guide: a markdown image, an `<img>`, or a `<source srcset>`. */
function uses(): Use[] {
  const found: Use[] = [];
  for (const page of PAGES) {
    const text = readSource(page);
    for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)\s]*images\/guide\/([^)\s/]+))\)/g)) {
      found.push({ page, file: m[3], alt: m[1] });
    }
    for (const tag of text.matchAll(/<img\b[^>]*>/g)) {
      const src = /src="[^"]*images\/guide\/([^"/]+)"/.exec(tag[0]);
      if (src) found.push({ page, file: src[1], alt: /alt="([^"]*)"/.exec(tag[0])?.[1] ?? null });
    }
    for (const tag of text.matchAll(/<source\b[^>]*>/g)) {
      const src = /srcset="[^"]*images\/guide\/([^"/]+)"/.exec(tag[0]);
      if (src) found.push({ page, file: src[1], alt: null });
    }
  }
  return found;
}

describe('the images of the user guide', () => {
  const files = listFiles(IMAGES);
  const names = files.map((f) => f.name);
  const all = uses();

  it('has images, and pages that show them', () => {
    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(new Set(all.map((u) => u.page)).size).toBeGreaterThanOrEqual(5);
  });

  it('shows only images that exist', () => {
    for (const use of all) expect(names, `${use.page} shows ${use.file}`).toContain(use.file);
  });

  it('has no image that no page shows', () => {
    const shown = new Set(all.map((u) => u.file));
    expect(names.filter((n) => !shown.has(n))).toEqual([]);
  });

  it('gives every image an alternative text that says what it shows, not "screenshot"', () => {
    for (const use of all.filter((u) => u.alt !== null)) {
      expect(use.alt!.length, `${use.page}: ${use.file}`).toBeGreaterThan(30);
      expect(use.alt!, `${use.page}: ${use.file}`).not.toMatch(/^(screenshot|image|picture)\b/i);
    }
  });

  it('has a dark picture for every light one, and the other way round', () => {
    for (const name of names.filter((n) => n.endsWith('-light.png'))) {
      expect(names, name).toContain(name.replace('-light.png', '-dark.png'));
    }
    for (const name of names.filter((n) => n.endsWith('-dark.png'))) {
      expect(names, name).toContain(name.replace('-dark.png', '-light.png'));
    }
  });

  it("shows a picture in both themes through <picture>, so that GitHub picks by the reader's theme", () => {
    for (const page of PAGES) {
      const text = readSource(page);
      for (const m of text.matchAll(/<picture>([\s\S]*?)<\/picture>/g)) {
        // Prettier may put the attributes on lines of their own: only what is there matters.
        expect(m[1], page).toMatch(
          /<source[^>]*media="\(prefers-color-scheme: dark\)"[^>]*srcset="[^"]+-dark\.png"/,
        );
        expect(m[1], page).toMatch(/<img[^>]*alt="[^"]+"[^>]*src="[^"]+-light\.png"/);
      }
    }
  });

  it('keeps each PNG under 400 kB, each GIF under 2 MB and all of them under 15 MB', () => {
    for (const file of files) {
      const limit = file.name.endsWith('.gif') ? MAX_GIF : MAX_PNG;
      expect(file.size, file.name).toBeLessThanOrEqual(limit);
    }
    expect(files.reduce((sum, f) => sum + f.size, 0)).toBeLessThanOrEqual(MAX_ALL);
  });
});
