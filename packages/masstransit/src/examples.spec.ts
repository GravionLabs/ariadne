import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDiagram, validate } from '@ariadne/core';
import { describe, expect, it } from 'vitest';
import { generateSaga } from './generate';

const root = resolve(import.meta.dirname, '../../..');
const examples = readdirSync(join(root, 'docs/examples'))
  .filter((f) => f.endsWith('.saga.yaml'))
  .map((f) => f.replace('.saga.yaml', ''));

describe.each(examples)('the example %s', (name) => {
  const diagram = parseDiagram(readFileSync(join(root, `docs/examples/${name}.saga.yaml`), 'utf8'));

  it('has no errors or warnings', () => {
    expect(validate(diagram).filter((f) => f.severity !== 'info')).toEqual([]);
  });

  // Regenerate with: ariadne generate docs/examples/<name>.saga.yaml -o samples/generated/<name>
  it('has up-to-date C# in samples/generated', () => {
    const dir = join(root, 'samples/generated', name);
    const { files } = generateSaga(diagram);
    expect(readdirSync(dir).sort()).toEqual(files.map((f) => f.path).sort());
    for (const f of files) expect(readFileSync(join(dir, f.path), 'utf8')).toBe(f.content);
  });
});
