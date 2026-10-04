import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Diagram, parseDiagram, serializeDiagram, validate } from '@ariadne/core';
import { diagramToMarkdown } from '@ariadne/export';
import { beforeAll, describe, expect, it } from 'vitest';
import { diffDiagrams } from './diff';
import { generateSaga } from './generate';
import { SourceFile, importSagas } from './import';
import { createNodeParser } from './node';
import { CSharpParser } from './parser';

/**
 * The sample library (samples/library): real-world sagas, each checked from end to end. The C# is
 * written by hand; the diagram, the generated C# and the documentation page are derived from it by
 * `node scripts/update-library.mjs`, and these tests fail when a file is not what that writes.
 */
const library = resolve(import.meta.dirname, '../../../samples/library');
let parser: CSharpParser;

beforeAll(async () => {
  parser = await createNodeParser();
});

const samples = readdirSync(library).filter((name) => statSync(join(library, name)).isDirectory());

/** The `.cs` files directly in a folder, as the importer takes them. */
function csharpIn(dir: string): SourceFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.cs'))
    .sort()
    .map((f) => ({ path: f, content: readFileSync(join(dir, f), 'utf8') }));
}

/** Says how to fix a derived file that is out of date. */
const regenerate = (name: string) =>
  `is out of date: run \`pnpm --filter @ariadne/cli build && node scripts/update-library.mjs ${name}\``;

describe('the sample library', () => {
  it('has samples, and a README that says what they are', () => {
    expect(samples.length).toBeGreaterThanOrEqual(1);
    const readme = readFileSync(join(library, 'README.md'), 'utf8');
    expect(readme).toContain('update-library.mjs');
  });

  describe.each(samples)('%s', (name) => {
    const dir = join(library, name);
    const goldenPath = join(dir, `${name}.saga.yaml`);

    it('has a README, the hand-written C#, and the files derived from it', () => {
      const files = readdirSync(dir);
      expect(files).toEqual(
        expect.arrayContaining(['README.md', `${name}.saga.yaml`, `${name}.docs.md`, 'generated']),
      );
      expect(files.filter((f) => f.endsWith('.cs')).length).toBeGreaterThanOrEqual(2);
      expect(readFileSync(join(dir, 'README.md'), 'utf8')).toMatch(/^# .+\n\n.+/);
    });

    it('imports from its C# as exactly one saga, without a warning', () => {
      const { sagas, warnings } = importSagas(csharpIn(dir), parser);
      expect(warnings, 'what the importer could not show').toEqual([]);
      expect(sagas).toHaveLength(1);
    });

    it('is the diagram that its C# gives', () => {
      const [saga] = importSagas(csharpIn(dir), parser).sagas;
      const golden = parseDiagram(readFileSync(goldenPath, 'utf8'));
      expect(diffDiagrams(saga.diagram, golden), `${name}.saga.yaml ${regenerate(name)}`).toEqual(
        [],
      );
      expect(readFileSync(goldenPath, 'utf8'), `${name}.saga.yaml ${regenerate(name)}`).toBe(
        serializeDiagram(saga.diagram),
      );
    });

    it('has no errors and no warnings of its own', () => {
      const findings = validate(parseDiagram(readFileSync(goldenPath, 'utf8')));
      expect(findings.filter((f) => f.severity !== 'info')).toEqual([]);
    });

    describe('generating C# from the diagram', () => {
      const diagram = (): Diagram => parseDiagram(readFileSync(goldenPath, 'utf8'));

      it('writes the files in generated/, and nothing it cannot generate', () => {
        const { files, warnings } = generateSaga(diagram());
        expect(warnings, 'what the generator could not write').toEqual([]);
        const onDisk = csharpIn(join(dir, 'generated'));
        expect(
          onDisk.map((f) => f.path),
          `generated/ ${regenerate(name)}`,
        ).toEqual(files.map((f) => f.path).sort());
        for (const file of files) {
          expect(
            onDisk.find((f) => f.path === file.path)?.content,
            `generated/${file.path} ${regenerate(name)}`,
          ).toBe(file.content);
        }
      });

      it('reads back as the same diagram', () => {
        const { sagas, warnings } = importSagas(csharpIn(join(dir, 'generated')), parser);
        expect(warnings).toEqual([]);
        expect(sagas).toHaveLength(1);
        expect(diffDiagrams(diagram(), sagas[0].diagram)).toEqual([]);
      });
    });

    it('has the documentation page that the export writes', () => {
      const diagram = parseDiagram(readFileSync(goldenPath, 'utf8'));
      const page = readFileSync(join(dir, `${name}.docs.md`), 'utf8');
      expect(page, `${name}.docs.md ${regenerate(name)}`).toBe(
        diagramToMarkdown(diagram, { title: diagram.name ?? name }),
      );
    });
  });
});
