import { repoPathOf } from './repo-links';

/** The tour samples of the app (`SAMPLES` in `apps/web/src/app/samples.ts`) by the file the guide links. */
const TOUR_SAMPLES: Readonly<Record<string, string>> = {
  'docs/examples/order.saga.yaml': 'order',
  'docs/examples/travel-booking.saga.yaml': 'travel-booking',
  'samples/sagas/booking': 'booking',
};

/**
 * The id of the sample that a link of the guide stands for, as `?sample=<id>` takes it, or null: a tour
 * sample by its file, a library sample by its README (`samples/library/<id>/README.md`).
 */
export function sampleIdOf(repoPath: string): string | null {
  return (
    TOUR_SAMPLES[repoPath] ?? /^samples\/library\/([^/]+)\/README\.md$/.exec(repoPath)?.[1] ?? null
  );
}

/** The samples that have an example path in the app (`path` in `samples.ts`): the tour. */
export const SAMPLES_WITH_PATH: readonly string[] = Object.values(TOUR_SAMPLES);

/** The page that lists the samples, and so gets the links to open them in the demo (also as rewritten). */
const SAMPLE_PAGES = ['guide/README.md', 'guide/index.md'];

interface Token {
  type: string;
  content: string;
  children: Token[] | null;
  attrs: [string, string][] | null;
  attrGet(name: string): string | null;
}
interface State {
  tokens: Token[];
  env: { relativePath?: string };
  Token: new (type: string, tag: string, nesting: number) => Token;
}
interface Markdown {
  core: { ruler: { push(name: string, rule: (state: State) => void): void } };
}

/**
 * Site only: in the sample tables of the guide, a link to a sample is followed by "Open in the demo",
 * which opens it in the editor (`<base>app/?sample=<id>`), and for a sample with an example instance
 * "with a path" (`&path=example`), which also shows that instance's path and timeline. The Markdown stays plain for GitHub, which
 * has no demo. Must be added before the repository-link plugin, which rewrites the addresses it reads.
 */
export function demoLinksPlugin(md: Markdown, base: string): void {
  md.core.ruler.push('ariadne_demo_links', (state) => {
    const page = state.env.relativePath;
    if (!page || !SAMPLE_PAGES.includes(page)) return;
    let inTable = false;
    let column = -1;
    for (const block of state.tokens) {
      if (block.type === 'table_open') inTable = true;
      else if (block.type === 'table_close') inTable = false;
      else if (block.type === 'tr_open') column = -1;
      else if (block.type === 'td_open' || block.type === 'th_open') column++;
      if (block.type !== 'inline' || !inTable || column !== 0 || !block.children) continue;
      const children: Token[] = [];
      let id: string | null = null;
      for (const token of block.children) {
        children.push(token);
        if (token.type === 'link_open') {
          const href = token.attrGet('href');
          const repoPath = href ? repoPathOf(href, page) : null;
          id = repoPath ? sampleIdOf(repoPath) : null;
        } else if (token.type === 'link_close' && id) {
          const separator = new state.Token('text', '', 0);
          separator.content = ' · ';
          const open = new state.Token('link_open', 'a', 1);
          open.attrs = [
            ['href', `${base}app/?sample=${encodeURIComponent(id)}`],
            ['target', '_self'],
          ];
          const label = new state.Token('text', '', 0);
          label.content = 'Open in the demo';
          children.push(separator, open, label, new state.Token('link_close', 'a', -1));
          if (SAMPLES_WITH_PATH.includes(id)) {
            const and = new state.Token('text', '', 0);
            and.content = ' · ';
            const withPath = new state.Token('link_open', 'a', 1);
            withPath.attrs = [
              ['href', `${base}app/?sample=${encodeURIComponent(id)}&path=example`],
              ['target', '_self'],
            ];
            const text = new state.Token('text', '', 0);
            text.content = 'with a path';
            children.push(and, withPath, text, new state.Token('link_close', 'a', -1));
          }
          id = null;
        }
      }
      block.children = children;
    }
  });
}
