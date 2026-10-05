import { createMarkdownRenderer } from 'vitepress';
import { describe, expect, it } from 'vitest';
import { RepoFiles, isSitePage, repoLink, repoLinksPlugin } from '../.vitepress/repo-links';

/** A repository with these files and folders (a path ending in `/` is a folder). */
const files = (...paths: string[]): RepoFiles => ({
  kind: (p) => (paths.includes(p) ? 'file' : paths.includes(`${p}/`) ? 'directory' : null),
});
const repo = files(
  'docs/guide/modelling.md',
  'docs/guide/README.md',
  'docs/examples/order.saga.yaml',
  'docs/adr/0005-activities-on-states.md',
  'docs/specs/diagram-format.md',
  'docs/specs/accessibility-checklist.md',
  'docs/self-hosting.md',
  'docs/compose.yaml',
  'samples/sagas/booking/',
  'samples/sagas/booking/BookingStateMachine.cs',
  'samples/library/README.md',
  'packages/viewer/README.md',
  'README.md',
);
const GH = 'https://github.com/GravionLabs/ariadne';

describe('isSitePage', () => {
  it('is the guide, the file format and self-hosting', () => {
    expect(isSitePage('docs/guide/modelling.md')).toBe(true);
    expect(isSitePage('docs/guide/README.md')).toBe(true);
    expect(isSitePage('docs/specs/diagram-format.md')).toBe(true);
    expect(isSitePage('docs/self-hosting.md')).toBe(true);
  });
  it('is nothing else: not the ADRs, the other specs, the samples or the images of the guide', () => {
    expect(isSitePage('docs/adr/0005-activities-on-states.md')).toBe(false);
    expect(isSitePage('docs/specs/accessibility-checklist.md')).toBe(false);
    expect(isSitePage('samples/library/README.md')).toBe(false);
    expect(isSitePage('docs/guide/image.png')).toBe(false);
  });
});

describe('repoLink', () => {
  const link = (href: string, page = 'guide/getting-started.md') => repoLink(href, page, repo);

  it('leaves the links to pages of the site, external links, anchors and mail alone', () => {
    expect(link('modelling.md')).toBe('modelling.md');
    expect(link('modelling.md#states')).toBe('modelling.md#states');
    expect(link('../self-hosting.md')).toBe('../self-hosting.md');
    expect(link('../specs/diagram-format.md')).toBe('../specs/diagram-format.md');
    expect(link('https://example.org/x')).toBe('https://example.org/x');
    expect(link('//example.org/x')).toBe('//example.org/x');
    expect(link('#top')).toBe('#top');
    expect(link('/ariadne/app/?sample=order')).toBe('/ariadne/app/?sample=order');
    expect(link('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('sends a file of the repository to GitHub as a blob', () => {
    expect(link('../examples/order.saga.yaml')).toBe(
      `${GH}/blob/main/docs/examples/order.saga.yaml`,
    );
    expect(link('../adr/0005-activities-on-states.md')).toBe(
      `${GH}/blob/main/docs/adr/0005-activities-on-states.md`,
    );
    expect(link('../specs/accessibility-checklist.md#x')).toBe(
      `${GH}/blob/main/docs/specs/accessibility-checklist.md#x`,
    );
    expect(link('../../packages/viewer/README.md')).toBe(
      `${GH}/blob/main/packages/viewer/README.md`,
    );
    expect(link('../../samples/library/README.md')).toBe(
      `${GH}/blob/main/samples/library/README.md`,
    );
  });

  it('sends a folder to GitHub as a tree', () => {
    expect(link('../../samples/sagas/booking')).toBe(`${GH}/tree/main/samples/sagas/booking`);
    expect(link('../../samples/sagas/booking/')).toBe(`${GH}/tree/main/samples/sagas/booking`);
  });

  it('reads the link from the page it is on', () => {
    expect(repoLink('../README.md', 'self-hosting.md', repo)).toBe(`${GH}/blob/main/README.md`);
    expect(repoLink('compose.yaml', 'self-hosting.md', repo)).toBe(
      `${GH}/blob/main/docs/compose.yaml`,
    );
    expect(repoLink('../examples/order.saga.yaml', 'specs/diagram-format.md', repo)).toBe(
      `${GH}/blob/main/docs/examples/order.saga.yaml`,
    );
  });

  it('leaves a link to something that is not there, so the dead-link check can say so', () => {
    expect(link('nowhere.md')).toBe('nowhere.md');
    expect(link('../../../outside.md')).toBe('../../../outside.md');
  });
});

describe('the markdown-it plugin', () => {
  it('rewrites the links of a page, in text, lists and tables, and not the images', async () => {
    const md = await createMarkdownRenderer(
      '/docs',
      { config: (m) => repoLinksPlugin(m as never, repo) },
      '/',
    );
    const html = md.render(
      [
        '[sample](../../samples/sagas/booking) and [page](modelling.md)',
        '',
        '- [file](../examples/order.saga.yaml)',
        '',
        '| a |',
        '| - |',
        '| [x](../../README.md) |',
        '',
        '![shot](../images/guide/x.png)',
      ].join('\n'),
      {
        relativePath: 'guide/getting-started.md',
        path: 'guide/getting-started.md',
        cleanUrls: true,
      },
    );
    expect(html).toContain(`href="${GH}/tree/main/samples/sagas/booking"`);
    expect(html).toContain('href="./modelling"');
    expect(html).toContain(`href="${GH}/blob/main/docs/examples/order.saga.yaml"`);
    expect(html).toContain(`href="${GH}/blob/main/README.md"`);
    expect(html).toMatch(/src="[^"]*images\/guide\/x\.png"/);
    expect(html).not.toContain('github.com/GravionLabs/ariadne/blob/main/docs/images');
  });
});
