import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMarkdownRenderer } from 'vitepress';
import { describe, expect, it } from 'vitest';
import { SAMPLES_WITH_PATH, demoLinksPlugin, sampleIdOf } from '../.vitepress/demo-links';
import { repoLinksPlugin } from '../.vitepress/repo-links';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('sampleIdOf', () => {
  it('knows the tour samples by their file, and the library samples by their README', () => {
    expect(sampleIdOf('docs/examples/order.saga.yaml')).toBe('order');
    expect(sampleIdOf('docs/examples/travel-booking.saga.yaml')).toBe('travel-booking');
    expect(sampleIdOf('samples/sagas/booking')).toBe('booking');
    expect(sampleIdOf('samples/library/loan-application/README.md')).toBe('loan-application');
  });
  it('knows nothing else: not the generated C#, not a folder of the library, not a page', () => {
    expect(sampleIdOf('samples/generated/order')).toBeNull();
    expect(sampleIdOf('samples/library/loan-application')).toBeNull();
    expect(sampleIdOf('samples/library/loan-application/generated')).toBeNull();
    expect(sampleIdOf('docs/guide/modelling.md')).toBeNull();
  });
});

describe('the ids the guide links to are samples of the app', () => {
  const samplesSource = readFileSync(resolve(repoRoot, 'apps/web/src/app/samples.ts'), 'utf8');
  const tour = [...samplesSource.matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);
  const library = readdirSync(resolve(repoRoot, 'samples/library'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it('offers "with a path" exactly for the samples that have an example path in the app', () => {
    const withPath = [...samplesSource.matchAll(/\bid: '([^']+)'[\s\S]*?(?=\bid: '|$)/g)]
      .filter((m) => /\bpath: \[/.test(m[0]))
      .map((m) => m[1]);
    expect([...SAMPLES_WITH_PATH].sort()).toEqual(withPath.sort());
  });

  it('finds the samples of the app', () => {
    expect(tour).toEqual(expect.arrayContaining(['order', 'booking', 'travel-booking']));
    expect(library.length).toBeGreaterThanOrEqual(5);
  });

  it('has an id of the app behind every sample table link of the guide', () => {
    const guide = readFileSync(resolve(repoRoot, 'docs/guide/README.md'), 'utf8');
    const ids = [...guide.matchAll(/^\|\s*\[[^\]]+\]\(([^)]+)\)/gm)].map((m) => {
      const repoPath = m[1]
        .replace(/^\.\.\/\.\.\//, '')
        .replace(/^\.\.\//, 'docs/')
        .replace(/\/$/, '');
      return sampleIdOf(repoPath);
    });
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      expect(id, 'a sample table row without an id').not.toBeNull();
      expect([...tour, ...library]).toContain(id);
    }
  });
});

describe('the markdown-it plugin', () => {
  const render = async (markdown: string, page = 'guide/README.md', base = '/ariadne/') => {
    const md = await createMarkdownRenderer(
      '/docs',
      {
        config: (m) => {
          demoLinksPlugin(m as never, base);
          repoLinksPlugin(m as never, { kind: () => 'file' });
        },
      },
      base,
    );
    return md.render(markdown, { relativePath: page, path: page, cleanUrls: true });
  };
  const table = [
    '| Sample | Shows |',
    '| - | - |',
    '| [Order saga](../examples/order.saga.yaml) | see [the booking](../../samples/sagas/booking) |',
    '| [Fulfilment](../../samples/library/order-fulfilment/README.md) | x |',
  ].join('\n');

  it('adds "Open in the demo" after the sample link of the first column, with the base of the site', async () => {
    const html = await render(table);
    expect(html).toContain(
      '<a href="/ariadne/app/?sample=order" target="_self">Open in the demo</a>',
    );
    expect(html).toContain('href="/ariadne/app/?sample=order-fulfilment"');
    expect(html.match(/Open in the demo/g)).toHaveLength(2);
    // A tour sample has an example instance, a library sample not.
    expect(html).toContain(
      '<a href="/ariadne/app/?sample=order&amp;path=example" target="_self">with a path</a>',
    );
    expect(html.match(/with a path/g)).toHaveLength(1);
    // The sample link itself still goes to the repository.
    expect(html).toContain(
      'href="https://github.com/GravionLabs/ariadne/blob/main/docs/examples/order.saga.yaml"',
    );
  });

  it('leaves the other columns, text outside a table and the other pages alone', async () => {
    expect(await render(table)).not.toContain('sample=booking');
    expect(await render('[Order](../examples/order.saga.yaml)')).not.toContain('Open in the demo');
    expect(await render(table, 'guide/modelling.md')).not.toContain('Open in the demo');
  });

  it('also works under the name the page has once rewritten', async () => {
    expect(await render(table, 'guide/index.md')).toContain('sample=order');
  });
});
