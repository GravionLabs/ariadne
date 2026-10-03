import orderSaga from '../../../docs/examples/order.saga.yaml?raw';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml?raw';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { Io, VERSION, run } from './cli';

/** The command line on an in-memory disk. */
function setup(files: Record<string, string> = {}) {
  const disk = new Map<string, string | Uint8Array>(Object.entries(files));
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    async readText(path) {
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
