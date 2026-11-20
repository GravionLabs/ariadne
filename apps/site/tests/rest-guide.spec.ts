import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(repo, path), 'utf8');

/** Where the snippets of the page come from: the demo page, the examples and the tests. */
const SOURCES = [
  'packages/viewer/demo/index.html',
  'packages/viewer/src/saga-element.spec.ts',
  'apps/viewer-demo/src/app/app.ts',
  'apps/viewer-demo/src/app/app.html',
  'apps/cli/README.md',
  'docs/specs/diagram-format.md',
  'docs/examples/order.saga.json',
].map(read);

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** The lines inside the code fences of the page. */
function snippetLines(page: string): string[] {
  return [...page.matchAll(/```\w*\n([\s\S]*?)```/g)].flatMap(([, body]) => lines(body));
}

describe('the guide page "Sagas from a REST API"', () => {
  const page = read('docs/guide/sagas-from-rest-api.md');
  const known = new Set(SOURCES.flatMap(lines));
  const squash = (text: string) => text.replace(/\s+/g, ' ');
  const sources = squash(SOURCES.join(' '));

  it('has code snippets', () => {
    expect(snippetLines(page).length).toBeGreaterThan(10);
  });

  it('takes every line of every snippet from the demo page, the examples or a test', () => {
    const invented = snippetLines(page).filter(
      (line) => !known.has(line) && !sources.includes(squash(line)),
    );
    expect(invented).toEqual([]);
  });

  it('is in the numbered list of the guide, so that it is in the sidebar', () => {
    expect(read('docs/guide/README.md')).toContain('(sagas-from-rest-api.md)');
  });

  it('links to the .NET library epic', () => {
    expect(page).toContain('https://github.com/GravionLabs/ariadne/issues/502');
  });
});
