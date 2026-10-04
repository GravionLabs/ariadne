import orderSaga from '../../../docs/examples/order.saga.yaml?raw';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml?raw';
import orderCode from '../../../samples/sagas/order/OrderStateMachine.cs?raw';
import orderGolden from '../../../samples/sagas/order/OrderStateMachine.saga.yaml?raw';
import bookingCode from '../../../samples/sagas/booking/BookingStateMachine.cs?raw';
import { serializeDiagram } from '@ariadne/core';
import { largeSaga } from '@ariadne/core/testing';
import { createNodeParser } from '@ariadne/masstransit/node';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { Io, VERSION, run } from './cli';
import { testFonts } from './test-fonts';

/** The command line on an in-memory disk. */
function setup(files: Record<string, string> = {}, overrides: Partial<Io> = {}) {
  const disk = new Map<string, string | Uint8Array>(Object.entries(files));
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    async readText(path) {
      if (path.endsWith('/')) throw new Error('EISDIR: illegal operation on a directory, read');
      const data = disk.get(path);
      if (data === undefined) throw new Error('no such file');
      return typeof data === 'string' ? data : new TextDecoder().decode(data);
    },
    async writeFile(path, data) {
      if (path.startsWith('/readonly/')) throw new Error('read-only');
      disk.set(path, data);
    },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    csharpParser: createNodeParser,
    pngFonts: testFonts,
    ...overrides,
  };
  return {
    disk,
    stdout: () => out.join(''),
    stderr: () => err.join(''),
    run: (...args: string[]) => run(args, io),
  };
}

const bad = `version: 3
nodes:
  - { id: start-1, type: start, name: Initial }
  - { id: state-1, type: state, name: Working }
  - { id: lost, type: state, name: Orphan }
  - { id: end-1, type: end, name: Done }
edges:
  - { id: e1, source: start-1, target: state-1 }
  - { id: e2, source: state-1, target: end-1 }
`;

describe('ariadne', () => {
  it('shows the usage without arguments (a mistake), and with --help', async () => {
    const none = setup();
    expect(await none.run()).toBe(2);
    expect(none.stdout()).toContain('Usage:');
    const help = setup();
    expect(await help.run('--help')).toBe(0);
    expect(help.stdout()).toContain('ariadne lint');
    expect(help.stdout()).toContain('ariadne export');
  });

  it('shows the version of the package', async () => {
    const t = setup();
    expect(await t.run('--version')).toBe(0);
    expect(t.stdout().trim()).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });

  it('refuses an unknown command and an unknown option, with the usage', async () => {
    const t = setup();
    expect(await t.run('frobnicate')).toBe(2);
    expect(t.stderr()).toContain('Unknown command “frobnicate”');
    expect(t.stderr()).toContain('Usage:');
    expect(await t.run('lint', '--nope', 'x.yaml')).toBe(2);
  });
});

describe('ariadne lint', () => {
  it('passes the example sagas', async () => {
    const t = setup({ 'order.saga.yaml': orderSaga, 'travel.saga.yaml': travelBooking });
    expect(await t.run('lint', 'order.saga.yaml', 'travel.saga.yaml')).toBe(0);
    expect(t.stdout()).not.toMatch(/: (error|warning):/);
    expect(t.stdout()).toMatch(/0 errors, 0 warnings, \d+ hints? in 2 files\./);
  });

  it('says so when there is nothing to report', async () => {
    const clean = `version: 3
nodes:
  - { id: s, type: start, name: Initial }
  - { id: e, type: end, name: Done }
edges:
  - { id: e1, source: s, target: e }
`;
    const t = setup({ 'clean.saga.yaml': clean });
    expect(await t.run('lint', 'clean.saga.yaml')).toBe(0);
    expect(t.stdout()).toBe('No problems in 1 file.\n');
  });

  it('reports errors with the name of the element and fails', async () => {
    const t = setup({ 'bad.saga.yaml': bad });
    expect(await t.run('lint', 'bad.saga.yaml')).toBe(1);
    const lines = t.stdout().trim().split('\n');
    expect(lines[0]).toBe(
      'bad.saga.yaml: error: “Orphan” cannot be reached from the initial state. [Orphan] (unreachable-state)',
    );
    // Errors first, then warnings, and a transition is named by its two ends.
    expect(lines).toContain(
      'bad.saga.yaml: warning: The transition from “Working” to “Done” has no event. [Working → Done] (missing-event)',
    );
    expect(lines.at(-1)).toBe('1 error, 2 warnings, 0 hints in 1 file.');
  });

  it('counts a file that is not a diagram as an error', async () => {
    const t = setup({ 'broken.saga.yaml': 'version: 7\n', 'order.saga.yaml': orderSaga });
    expect(await t.run('lint', 'broken.saga.yaml', 'order.saga.yaml')).toBe(1);
    expect(t.stdout()).toContain(
      'broken.saga.yaml: error: not a valid saga diagram: Unsupported format version 7',
    );
  });

  it('refuses a file over the size limit with the message, and fails', async () => {
    const huge = `version: 3\nname: ${'x'.repeat(5_000_000)}\n`;
    const t = setup({ 'huge.saga.yaml': huge });
    expect(await t.run('lint', 'huge.saga.yaml')).toBe(1);
    expect(t.stdout()).toContain(
      'huge.saga.yaml: error: not a valid saga diagram: The file is 5 MB; Ariadne reads diagrams up to 5 MB.',
    );
  });

  it('fails on warnings only above --max-warnings', async () => {
    const warned = bad.replace('  - { id: lost, type: state, name: Orphan }\n', '');
    const t = setup({ 'warned.saga.yaml': warned });
    expect(await t.run('lint', 'warned.saga.yaml')).toBe(0);
    expect(await t.run('lint', 'warned.saga.yaml', '--max-warnings', '1')).toBe(0);
    expect(await t.run('lint', 'warned.saga.yaml', '--max-warnings', '0')).toBe(1);
  });

  it('writes the findings as JSON', async () => {
    const t = setup({ 'bad.saga.yaml': bad, 'broken.saga.yaml': 'version: 3\nnodes: 3\n' });
    expect(await t.run('lint', '--format', 'json', 'bad.saga.yaml', 'broken.saga.yaml')).toBe(1);
    const reports = JSON.parse(t.stdout());
    expect(reports.map((r: { file: string }) => r.file)).toEqual([
      'bad.saga.yaml',
      'broken.saga.yaml',
    ]);
    expect(reports[0].invalid).toBeNull();
    expect(reports[0].findings[0]).toMatchObject({
      severity: 'error',
      code: 'unreachable-state',
      elementId: 'lost',
      element: 'Orphan',
    });
    expect(reports[1].invalid).toContain('nodes must be a list');
  });

  it('needs files, and a known format and a number', async () => {
    const t = setup({ 'order.saga.yaml': orderSaga });
    expect(await t.run('lint')).toBe(2);
    expect(await t.run('lint', '--format', 'xml', 'order.saga.yaml')).toBe(2);
    expect(await t.run('lint', '--max-warnings', 'many', 'order.saga.yaml')).toBe(2);
  });

  it('exits with 2 for a file it cannot read', async () => {
    const t = setup();
    expect(await t.run('lint', 'missing.saga.yaml')).toBe(2);
    expect(t.stderr()).toContain('cannot read missing.saga.yaml');
  });
});

describe('ariadne export', () => {
  const files = { 'sagas/order.saga.yaml': orderSaga };

  it('prints Mermaid text', async () => {
    const t = setup(files);
    expect(await t.run('export', 'sagas/order.saga.yaml', '--format', 'mermaid')).toBe(0);
    expect(t.stdout()).toMatch(/^---\ntitle: "OrderSaga"\n---\nstateDiagram-v2\n/);
    expect(t.stdout().endsWith('\n')).toBe(true);
  });

  it('writes a Markdown page, titled with the saga’s name or else the file name', async () => {
    const named = setup(files);
    expect(
      await named.run('export', 'sagas/order.saga.yaml', '-f', 'md', '-o', 'out/order.md'),
    ).toBe(0);
    expect(named.stdout()).toBe('');
    expect(String(named.disk.get('out/order.md'))).toMatch(/^# OrderSaga\n/);
    const unnamed = setup({
      'sagas/refund.saga.yaml': orderSaga.replace(/^name: .*\n|^description: .*\n/gm, ''),
    });
    await unnamed.run('export', 'sagas/refund.saga.yaml', '--format', 'md');
    expect(unnamed.stdout()).toMatch(/^# refund\n/);
  });

  it('writes an SVG, to a file or to the standard output', async () => {
    const toFile = setup(files);
    expect(
      await toFile.run(
        'export',
        'sagas/order.saga.yaml',
        '--format',
        'svg',
        '--output',
        'order.svg',
      ),
    ).toBe(0);
    expect(String(toFile.disk.get('order.svg'))).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/,
    );
    const toOut = setup(files);
    await toOut.run('export', 'sagas/order.saga.yaml', '--format', 'svg');
    expect(toOut.stdout()).toContain('<svg');
  });

  it('rasterises a PNG at twice the size', async () => {
    const t = setup(files);
    expect(
      await t.run('export', 'sagas/order.saga.yaml', '--format', 'png', '-o', 'order.png'),
    ).toBe(0);
    const png = t.disk.get('order.png') as Uint8Array;
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Width and height are in the IHDR chunk, big-endian.
    const view = new DataView(png.buffer, png.byteOffset);
    const svg = setup(files);
    await svg.run('export', 'sagas/order.saga.yaml', '--format', 'svg');
    const width = Number(/width="(\d+)"/.exec(svg.stdout())![1]);
    expect(view.getUint32(16)).toBe(width * 2);
  });

  it('exports the travel booking saga in every format', async () => {
    const t = setup({ 't.saga.yaml': travelBooking });
    for (const format of ['mermaid', 'svg', 'md']) {
      expect(await t.run('export', 't.saga.yaml', '--format', format)).toBe(0);
    }
    expect(await t.run('export', 't.saga.yaml', '--format', 'png', '-o', 't.png')).toBe(0);
  });

  it('scales a PNG down so that no side is longer than 16 384 px, instead of drawing 300 megapixels', async () => {
    // 150 states in a line are 37 000 px tall: at 2× the picture would be 300 megapixels.
    const t = setup({ 'big.saga.yaml': serializeDiagram(largeSaga(150)) });
    expect(await t.run('export', 'big.saga.yaml', '--format', 'png', '-o', 'big.png')).toBe(0);
    const png = t.disk.get('big.png') as Uint8Array;
    const view = new DataView(png.buffer, png.byteOffset);
    const [width, height] = [view.getUint32(16), view.getUint32(20)];
    expect(height).toBe(16_384);
    expect(width).toBeGreaterThan(500);
    expect(width).toBeLessThan(2_000);
  });

  it("draws the text of a PNG with the font it was given, not the machine's fonts", async () => {
    const withFonts = setup({ 'o.saga.yaml': orderSaga });
    const without = setup({ 'o.saga.yaml': orderSaga }, { pngFonts: () => [] });
    expect(await withFonts.run('export', 'o.saga.yaml', '--format', 'png', '-o', 'o.png')).toBe(0);
    expect(await without.run('export', 'o.saga.yaml', '--format', 'png', '-o', 'o.png')).toBe(0);
    // No system fonts are read, so with no font file there is no text: a smaller picture.
    const size = (t: typeof withFonts) => (t.disk.get('o.png') as Uint8Array).length;
    expect(size(withFonts)).toBeGreaterThan(size(without) * 1.1);
  });

  it('is used wrongly without a format, with an unknown one, with PNG to the console, or with two files', async () => {
    const t = setup(files);
    expect(await t.run('export', 'sagas/order.saga.yaml')).toBe(2);
    expect(await t.run('export', 'sagas/order.saga.yaml', '--format', 'pdf')).toBe(2);
    expect(await t.run('export', 'sagas/order.saga.yaml', '--format', 'png')).toBe(2);
    expect(t.stderr()).toContain('add -o <file.png>');
    expect(await t.run('export', '--format', 'svg')).toBe(2);
    expect(await t.run('export', 'a.saga.yaml', 'b.saga.yaml', '--format', 'svg')).toBe(2);
  });

  it('says why when the diagram is invalid (exit 1), or a file cannot be read or written (exit 2)', async () => {
    const t = setup({ ...files, 'old.saga.yaml': 'version: 9\n' });
    expect(await t.run('export', 'old.saga.yaml', '--format', 'svg')).toBe(1);
    expect(t.stderr()).toContain('old.saga.yaml: not a valid saga diagram');
    expect(await t.run('export', 'nope.saga.yaml', '--format', 'svg')).toBe(2);
    expect(
      await t.run('export', 'sagas/order.saga.yaml', '--format', 'svg', '-o', '/readonly/x.svg'),
    ).toBe(2);
    expect(t.stderr()).toContain('cannot write /readonly/x.svg');
  });
});

describe('ariadne generate', () => {
  it('writes the C# files into the directory and lists them', async () => {
    const t = setup({ 'order.saga.yaml': orderSaga });
    expect(await t.run('generate', 'order.saga.yaml', '-o', 'out/')).toBe(0);
    const names = [...t.disk.keys()].filter((k) => k.startsWith('out/'));
    expect(names.every((n) => n.endsWith('.cs'))).toBe(true);
    expect(names.length).toBe(3);
    expect(t.stdout().trim().split('\n')).toEqual(names);
    expect(t.disk.get(names[0])).toContain('MassTransitStateMachine<');
  });

  it('needs one file', async () => {
    const t = setup();
    expect(await t.run('generate')).toBe(2);
    expect(t.stderr()).toContain('generate needs exactly one file');
  });

  it('reports a file that is not a diagram', async () => {
    const t = setup({ 'x.saga.yaml': 'nodes: 3' });
    expect(await t.run('generate', 'x.saga.yaml')).toBe(1);
    expect(t.stderr()).toContain('not a valid saga diagram');
  });
});

describe('ariadne import', () => {
  it('writes a *.saga.yaml per saga and lists them', async () => {
    const t = setup({ 'Order.cs': orderCode, 'Booking.cs': bookingCode });
    expect(await t.run('import', 'Order.cs', 'Booking.cs', '-o', 'out')).toBe(0);
    expect(t.stdout().trim().split('\n')).toEqual([
      'out/OrderStateMachine.saga.yaml',
      'out/BookingStateMachine.saga.yaml',
    ]);
    expect(t.disk.get('out/OrderStateMachine.saga.yaml')).toBe(orderGolden);
  });

  it('says where in the code something could not be shown', async () => {
    const t = setup({ 'Order.cs': orderCode });
    await t.run('import', 'Order.cs', '-o', 'out');
    expect(t.stderr()).toMatch(/^Order\.cs:\d+: warning: /m);
  });

  it('exits with 1 when there is no saga', async () => {
    const t = setup({ 'A.cs': 'class A {}' });
    expect(await t.run('import', 'A.cs')).toBe(1);
    expect(t.stderr()).toContain('No MassTransit saga state machine');
  });

  it('needs a file', async () => {
    expect(await setup().run('import')).toBe(2);
  });
});

describe('ariadne diff', () => {
  const files = { 'order.saga.yaml': orderGolden, 'Order.cs': orderCode };

  it('is quiet about a diagram and the code it came from', async () => {
    const t = setup(files);
    expect(await t.run('diff', 'order.saga.yaml', 'Order.cs')).toBe(0);
    expect(t.stdout()).toContain('agree');
  });

  it('lists the differences and exits with 1', async () => {
    const t = setup({
      ...files,
      'Order.cs': orderCode.replace('When(StockReserved)', 'When(StockUnavailable)'),
    });
    expect(await t.run('diff', 'order.saga.yaml', 'Order.cs')).toBe(1);
    expect(t.stdout()).toContain('is in the diagram, not in the code');
    expect(t.stdout()).toMatch(/\d+ differences?\./);
  });

  it('needs --class when the files have several state machines and the diagram does not say', async () => {
    const t = setup({
      'd.saga.yaml': 'version: 3\nnodes:\n  - { id: s, type: start, name: Initial }\nedges: []\n',
      'All.cs': orderCode + bookingCode,
    });
    expect(await t.run('diff', 'd.saga.yaml', 'All.cs')).toBe(2);
    expect(t.stderr()).toContain('Pass --class');
    expect(await t.run('diff', 'd.saga.yaml', 'All.cs', '--class', 'Nope')).toBe(1);
  });
});

describe('ariadne, files it cannot use', () => {
  const oneLine = (text: string) => {
    expect(text.trimEnd().split('\n')).toHaveLength(1);
    expect(text).not.toMatch(/\n\s+at /);
  };

  it('a directory given as the file: one line, no stack, exit 2', async () => {
    const t = setup();
    expect(await t.run('lint', 'some/dir/')).toBe(2);
    expect(t.stderr()).toBe(
      'ariadne: cannot read some/dir/: EISDIR: illegal operation on a directory, read\n',
    );
    oneLine(t.stderr());
    expect(t.stdout()).toBe('');
  });

  it('a missing file: one line, no stack, exit 2', async () => {
    const t = setup();
    expect(await t.run('lint', 'missing.saga.yaml')).toBe(2);
    expect(t.stderr()).toBe('ariadne: cannot read missing.saga.yaml: no such file\n');
    oneLine(t.stderr());
  });

  it('a binary file: reported as not a diagram, on one line, exit 1', async () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, i) => (i * 37) % 256));
    const t = setup();
    t.disk.set('blob.saga.yaml', bytes);
    expect(await t.run('lint', 'blob.saga.yaml')).toBe(1);
    const [first] = t.stdout().split('\n');
    expect(first).toMatch(/^blob\.saga\.yaml: error: not a valid saga diagram: .+/);
    expect(await t.run('generate', 'blob.saga.yaml')).toBe(1);
    expect(t.stderr()).toMatch(/^blob\.saga\.yaml: not a valid saga diagram: [^\n]+\n$/);
  });

  it('YAML with a syntax error: the reason and the position on one line', async () => {
    const t = setup({ 'bad.saga.yaml': 'version: 3\nnodes: [\n  - a: b\nedges: {\n' });
    expect(await t.run('lint', 'bad.saga.yaml')).toBe(1);
    const lines = t.stdout().trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Not valid YAML: Block collections are not allowed');
    expect(lines[0]).toContain('at line 3, column 3');
  });

  it('-o into a folder it cannot write: one line, no stack, exit 2', async () => {
    const t = setup({ 'OrderStateMachine.cs': orderCode });
    expect(await t.run('import', 'OrderStateMachine.cs', '-o', '/readonly/out')).toBe(2);
    expect(t.stderr()).toContain(
      'ariadne: cannot write /readonly/out/OrderStateMachine.saga.yaml: read-only',
    );
    oneLine(
      t
        .stderr()
        .split('\n')
        .filter((l) => l.startsWith('ariadne:'))
        .join('\n'),
    );
    expect(t.stderr()).not.toContain('Usage:');
  });
});
