import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guidePages, sidebarOf } from '../.vitepress/sidebar';

const docs = resolve(import.meta.dirname, '../../../docs');
const readme = readFileSync(resolve(docs, 'guide/README.md'), 'utf8');

describe('guidePages', () => {
  it('reads the numbered list in its order, with the titles of the links', () => {
    expect(
      guidePages(
        [
          '# Guide',
          '1. [First](first.md): about it.',
          '2. [Second page](second.md)',
          '- [Not numbered](skipped.md)',
          '3. [With anchor](third.md#part)',
          'Operators: [x](../x.md).',
        ].join('\n'),
      ),
    ).toEqual([
      { text: 'First', link: '/guide/first' },
      { text: 'Second page', link: '/guide/second' },
      { text: 'With anchor', link: '/guide/third' },
    ]);
  });

  it('gives nothing for a text without a list', () => {
    expect(guidePages('')).toEqual([]);
    expect(guidePages('# Title\n\nText [link](a.md).')).toEqual([]);
  });
});

describe('the sidebar of the real guide', () => {
  const pages = guidePages(readme);

  it('has a page for every entry of the list, in the order of the list', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
    for (const page of pages)
      expect(existsSync(resolve(docs, `${page.link.slice(1)}.md`))).toBe(true);
    const order = [...readme.matchAll(/^\d+\.\s+\[[^\]]+\]\(([^)#\s]+)\.md\)/gm)].map(
      (m) => `/guide/${m[1]}`,
    );
    expect(pages.map((p) => p.link)).toEqual(order);
  });

  it('lists every page of the guide: a new page must be added to the list in the README', () => {
    const onDisk = readdirSync(resolve(docs, 'guide'))
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => `/guide/${f.replace(/\.md$/, '')}`);
    expect(pages.map((p) => p.link).sort()).toEqual(onDisk.sort());
  });

  it('starts with the guide home and ends with the reference pages', () => {
    const sidebar = sidebarOf(readme);
    expect(sidebar[0].items[0]).toEqual({ text: 'Overview and samples', link: '/guide/' });
    expect(sidebar[0].items.slice(1)).toEqual(pages);
    expect(sidebar[1].items.map((i) => i.link)).toEqual(['/specs/diagram-format', '/self-hosting']);
  });
});
