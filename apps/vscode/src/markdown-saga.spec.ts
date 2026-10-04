import MarkdownIt from 'markdown-it';
import * as path from 'node:path';
import { sagaPlugin } from './markdown-saga';

const DIAGRAM = `version: 3
name: Order Saga
direction: top-bottom
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Submitted
edges:
  - id: e1
    source: a
    target: b
    kind: forward
    event: OrderSubmitted
    eventSource: Shop
`;

const files = new Map<string, string>();
const read = vi.fn((file: string) => files.get(file));
const md = () => new MarkdownIt().use(sagaPlugin, { readFile: read });

/** The SVG inside the first data URI of the html. */
function svgOf(html: string): string {
  const base64 = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)![1]!;
  return Buffer.from(base64, 'base64').toString('utf8');
}

beforeEach(() => {
  files.clear();
  read.mockClear();
});

describe('fenced saga blocks', () => {
  it('render the diagram as an image', () => {
    const html = md().render('Before\n\n```saga\n' + DIAGRAM + '```\n\nAfter\n');
    expect(html).toContain('<p>Before</p>');
    expect(html).toContain('<p>After</p>');
    expect(html).toContain('class="ariadne-saga"');
    expect(html).toContain('alt="Saga diagram: Order Saga"');
    expect(svgOf(html)).toContain('Submitted');
    expect(html).not.toContain('<pre><code');
  });

  it('leave other code blocks alone', () => {
    const html = md().render('```yaml\nversion: 3\n```\n\n```\nplain\n```\n');
    expect(html).toContain('<pre><code class="language-yaml">');
    expect(html).toContain('plain');
    expect(html).not.toContain('ariadne-saga');
  });

  it('take the info string as the language, with more after it', () => {
    const html = md().render('```saga title="x"\n' + DIAGRAM + '```\n');
    expect(html).toContain('class="ariadne-saga"');
  });

  it('say what is wrong with a diagram that cannot be read, in its place', () => {
    const html = md().render('Text\n\n```saga\nnodes: [unclosed\n```\n\nMore\n');
    expect(html).toContain('class="ariadne-saga-error"');
    expect(html).toContain('Saga diagram: Not valid YAML');
    expect(html).toContain('<p>More</p>');
  });

  it('escape what the message quotes', () => {
    const html = md().render('```saga\nversion: 3\nnodes:\n  - id: "<b>"\n    type: nope\n```\n');
    expect(html).not.toContain('<b>');
  });

  it('show an empty diagram without failing', () => {
    expect(md().render('```saga\nversion: 3\n```\n')).toContain('ariadne-saga');
  });
});

describe('image links to *.saga.yaml', () => {
  const doc = path.resolve('/w/docs/readme.md');
  const render = (
    text: string,
    env: Record<string, unknown> = { currentDocument: { fsPath: doc } },
  ) => md().render(text, env);

  it('show the file next to the document', () => {
    files.set(path.resolve('/w/docs/order.saga.yaml'), DIAGRAM);
    const html = render('![the order saga](order.saga.yaml)');
    expect(svgOf(html)).toContain('Submitted');
    expect(html).toContain('class="ariadne-saga"');
  });

  it('find a file in another folder', () => {
    files.set(path.resolve('/w/sagas/order.saga.yaml'), DIAGRAM);
    expect(render('![](../sagas/order.saga.yaml)')).toContain('ariadne-saga');
  });

  it('read an encoded path, and ignore a fragment or query', () => {
    files.set(path.resolve('/w/docs/my saga.saga.yaml'), DIAGRAM);
    expect(render('![](my%20saga.saga.yaml#top)')).toContain('ariadne-saga');
  });

  it('say so when the file is not there', () => {
    const html = render('![](missing.saga.yaml)');
    expect(html).toContain('ariadne-saga-error');
    expect(html).toContain('missing.saga.yaml cannot be read.');
  });

  it('say what is wrong with a file that cannot be read as a diagram', () => {
    files.set(path.resolve('/w/docs/bad.saga.yaml'), 'version: 9');
    expect(render('![](bad.saga.yaml)')).toContain('Unsupported format version');
  });

  it('leave other images alone, also remote ones that end like a diagram', () => {
    const html = render('![logo](logo.png) ![x](https://example.com/a.saga.yaml)');
    expect(html).toContain('<img src="logo.png" alt="logo">');
    expect(html).toContain('src="https://example.com/a.saga.yaml"');
    expect(read).not.toHaveBeenCalled();
  });

  it('use the fallback folder when the preview does not say which document it renders', () => {
    files.set(path.resolve('/w/order.saga.yaml'), DIAGRAM);
    const html = new MarkdownIt()
      .use(sagaPlugin, { readFile: read, fallbackFolder: () => path.resolve('/w') })
      .render('![](order.saga.yaml)', {});
    expect(html).toContain('ariadne-saga');
  });

  it('draw the same file only once', () => {
    files.set(path.resolve('/w/docs/order.saga.yaml'), DIAGRAM);
    const engine = md();
    const env = { currentDocument: { fsPath: doc } };
    expect(engine.render('![](order.saga.yaml)', env)).toBe(
      engine.render('![](order.saga.yaml)', env),
    );
  });
});
