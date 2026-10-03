import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const examples = resolve(root, '../../docs/examples');
const bin = join(root, 'dist/ariadne.mjs');

/** Runs the bundled command like a user would; a non-zero exit is a result, not a failure. */
async function ariadne(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    const { code, stdout, stderr } = e as { code: number; stdout: string; stderr: string };
    return { code, stdout, stderr };
  }
}

// The bundle is what gets installed, so it is tested as built: with the sample sagas of the repo.
describe('the bundled ariadne command', () => {
  let out: string;

  beforeAll(async () => {
    await run(process.execPath, ['build.mjs'], { cwd: root });
    out = await mkdtemp(join(tmpdir(), 'ariadne-cli-'));
  }, 60_000);

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it('starts with a shebang and prints its version', async () => {
    expect((await readFile(bin, 'utf8')).startsWith('#!/usr/bin/env node\n')).toBe(true);
    const { code, stdout } = await ariadne('--version');
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('lints the sample sagas: no errors', async () => {
    const { code, stdout } = await ariadne(
      'lint',
      join(examples, 'order.saga.yaml'),
      join(examples, 'travel-booking.saga.yaml'),
    );
    expect(stdout).toMatch(/0 errors, 0 warnings/);
    expect(code).toBe(0);
  });

  it('fails the build for a saga with an error', async () => {
    const file = join(out, 'bad.saga.yaml');
    const bad =
      'version: 3\nnodes:\n  - { id: s, type: start, name: Initial }\n  - { id: x, type: state, name: Lost }\n';
    await writeFile(file, bad);
    const { code, stdout } = await ariadne('lint', file);
    expect(code).toBe(1);
    expect(stdout).toContain('“Lost” cannot be reached');
  });

  it('exports every format of a sample saga', async () => {
    const order = join(examples, 'order.saga.yaml');
    const svg = join(out, 'order.svg');
    const png = join(out, 'order.png');
    expect((await ariadne('export', order, '-f', 'svg', '-o', svg)).code).toBe(0);
    expect((await ariadne('export', order, '-f', 'png', '-o', png)).code).toBe(0);
    expect(await readFile(svg, 'utf8')).toContain('<svg');
    expect([...(await readFile(png)).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    expect((await ariadne('export', order, '-f', 'mermaid')).stdout).toContain('stateDiagram-v2');
    expect((await ariadne('export', order, '-f', 'md')).stdout).toMatch(/^# OrderSaga/);
  });
});
