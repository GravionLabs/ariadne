import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { layoutDiagram, parseDiagram, serializeDiagram } from '@ariadne/core';
import * as fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { diffDiagrams } from './diff';
import { ImportResult, SourceFile, importSagas } from './import';
import { createNodeParser } from './node';
import { CSharpParser } from './parser';

const odd = resolve(import.meta.dirname, '__fixtures__/odd');
const samples = resolve(import.meta.dirname, '../../../samples/sagas');

let parser: CSharpParser;
beforeAll(async () => {
  parser = await createNodeParser();
});

const fixture = (name: string): SourceFile => ({
  path: name,
  content: readFileSync(join(odd, name), 'utf8'),
});

/** Every `.cs` file under a directory, with `/` paths relative to it. */
function csFiles(root: string, dir = ''): SourceFile[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return csFiles(root, path);
    return entry.name.endsWith('.cs')
      ? [{ path, content: readFileSync(join(root, path), 'utf8') }]
      : [];
  });
}

/** Imports without throwing, and checks that every warning points into a file that was given. */
function importChecked(files: SourceFile[]): ImportResult {
  const result = importSagas(files, parser);
  for (const warning of result.warnings) {
    const file = files.find((f) => f.path === warning.path);
    expect(file, `warning for a file that was not given: ${warning.path}`).toBeDefined();
    const lines = file!.content.split('\n').length;
    expect(warning.line, `${warning.path}: ${warning.message}`).toBeGreaterThanOrEqual(1);
    expect(warning.line, `${warning.path}: ${warning.message}`).toBeLessThanOrEqual(lines);
  }
  return result;
}

/** What the rest of Ariadne does with an imported diagram: save it, lay it out, compare it. */
function useDiagrams(result: ImportResult): void {
  for (const { diagram } of result.sagas) {
    expect(parseDiagram(serializeDiagram(diagram))).toEqual(diagram);
    expect(() => layoutDiagram(diagram)).not.toThrow();
    expect(() => diffDiagrams(diagram, diagram)).not.toThrow();
  }
}

const statesOf = (result: ImportResult) =>
  result.sagas.map((s) => [s.className, s.diagram.nodes.map((n) => n.name)]);
const messages = (result: ImportResult) => result.warnings.map((w) => w.message);

describe('odd but valid C#', () => {
  const imports: [string, string[], [string, string[]][]][] = [
    // [file, [its own parts if split], [class, states]]
    [
      'a partial class split over two files',
      ['partial-a.cs', 'partial-b.cs'],
      [['PartialStateMachine', ['Initial', 'Working', 'Final']]],
    ],
    [
      'a file-scoped namespace after another type',
      ['file-scoped-namespace.cs'],
      [['FileScopedStateMachine', ['Initial', 'Working']]],
    ],
    [
      'namespaces nested in braces',
      ['nested-namespace.cs'],
      [['NestedStateMachine', ['Initial', 'Working']]],
    ],
    [
      'global::MassTransit.MassTransitStateMachine<T>',
      ['global-qualified-base.cs'],
      [['GlobalStateMachine', ['Initial', 'Working']]],
    ],
    [
      'generic helpers and expression-bodied members',
      ['generic-and-expression-bodied.cs'],
      [['ExpressionStateMachine', ['Initial', 'Working']]],
    ],
    [
      'attributes, #if and #region',
      ['attributes-and-directives.cs'],
      [['DirectiveStateMachine', ['Initial', 'Working', 'Final']]],
    ],
    [
      'comments inside the calls and a long chain',
      ['comments-and-long-chains.cs'],
      [['ChainStateMachine', ['Initial', 'Working', 'Final']]],
    ],
    [
      'unicode and @-escaped identifiers',
      ['unicode-and-escaped-identifiers.cs'],
      [['ÜberStateMachine', ['Initial', 'Läuft', 'class']]],
    ],
    [
      'events and states as fields, several states in one declaration',
      ['events-and-states-forms.cs'],
      [['FormsStateMachine', ['Initial', 'A', 'B', 'C', 'Final']]],
    ],
    [
      'a record, an interface, an enum and a class around it',
      ['record-and-unrelated-class.cs'],
      [['MixedStateMachine', ['Initial', 'Working']]],
    ],
    [
      'an empty constructor, and no constructor',
      ['empty-constructor.cs'],
      [
        ['EmptyStateMachine', ['Initial', 'Working']],
        ['NoConstructorStateMachine', ['Initial', 'Working']],
      ],
    ],
    [
      'constructs that are valid but not drawn',
      ['unsupported-and-odd-calls.cs'],
      [['UnsupportedStateMachine', ['Initial', 'Working', 'Waiting']]],
    ],
  ];

  it.each(imports)('%s: imports the states', (_what, names, expected) => {
    const result = importChecked(names.map(fixture));
    expect(statesOf(result)).toEqual(expected);
    useDiagrams(result);
  });

  it('says what it leaves out of the constructs it does not draw', () => {
    const result = importChecked([fixture('unsupported-and-odd-calls.cs')]);
    const said = messages(result).join('\n');
    for (const call of ['CompositeEvent', 'Schedule', 'Switch', 'WhenLeave']) {
      expect(said).toContain(`${call}(…)`);
    }
  });

  it('does not take the code in a raw string literal for the saga', () => {
    const result = importChecked([fixture('unicode-and-escaped-identifiers.cs')]);
    expect(result.sagas[0].diagram.nodes.map((n) => n.name)).not.toContain('Fake');
  });

  it('gives a warning for a state machine derived from a project base class', () => {
    const result = importChecked([fixture('project-base-class.cs')]);
    expect(result.sagas).toEqual([]);
    expect(messages(result).join('\n')).toContain('AuditedStateMachine<ProjectState>');
  });

  it('gives a warning for a base class behind a using alias', () => {
    const result = importChecked([fixture('alias-base.cs')]);
    expect(result.sagas).toEqual([]);
    expect(messages(result).join('\n')).toContain('derives from SM');
  });

  it('finds nothing, and says nothing, in valid C# that has no state machine', () => {
    for (const name of ['no-state-machine.cs', 'empty.cs', 'whitespace-only.cs']) {
      const result = importChecked([fixture(name)]);
      expect(result, name).toEqual({ sagas: [], warnings: [] });
    }
  });
});

describe('broken C#', () => {
  it.each(['not-csharp.cs', 'unbalanced-braces.cs'])('%s: a warning, not an exception', (name) => {
    const result = importChecked([fixture(name)]);
    expect(messages(result).join('\n')).toContain('not valid C#');
  });

  it('keeps reading the other files when one is broken', () => {
    const result = importChecked([fixture('not-csharp.cs'), fixture('file-scoped-namespace.cs')]);
    expect(statesOf(result)).toEqual([['FileScopedStateMachine', ['Initial', 'Working']]]);
    expect(result.warnings.every((w) => w.path === 'not-csharp.cs')).toBe(true);
  });
});

describe('mutated sample sagas', () => {
  const files = csFiles(samples);
  const tokens = [
    '{',
    '}',
    '(',
    ')',
    ';',
    '.',
    ',',
    '=>',
    'When',
    'During(',
    'class',
    '"',
    '@',
    '#if',
  ];

  /** One random edit of a source text. */
  const mutation = fc.record({
    how: fc.constantFrom(
      'delete-lines',
      'duplicate-line',
      'insert-token',
      'truncate',
      'remove-braces',
    ),
    at: fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
    length: fc.integer({ min: 1, max: 6 }),
    token: fc.constantFrom(...tokens),
  });

  type Mutation = typeof mutation extends fc.Arbitrary<infer T> ? T : never;

  function mutate(text: string, { how, at, length, token }: Mutation): string {
    const lines = text.split('\n');
    const index = Math.floor(at * lines.length);
    switch (how) {
      case 'delete-lines':
        lines.splice(index, length);
        return lines.join('\n');
      case 'duplicate-line':
        lines.splice(index, 0, lines[index]);
        return lines.join('\n');
      case 'insert-token': {
        const offset = Math.floor(at * text.length);
        return text.slice(0, offset) + token + text.slice(offset);
      }
      case 'truncate':
        return text.slice(0, Math.floor(at * text.length));
      case 'remove-braces':
        return text.replace(/[{}]/g, (brace, position: number) =>
          position / text.length >= at && position / text.length < at + length / 20 ? '' : brace,
        );
    }
  }

  it('finds sample files to mutate', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('never throws, and warnings point into the files', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: files.length - 1 }),
        fc.array(mutation, { minLength: 1, maxLength: 3 }),
        (which, mutations) => {
          const original = files[which];
          const content = mutations.reduce(mutate, original.content);
          const result = importChecked([{ path: original.path, content }]);
          useDiagrams(result);
        },
      ),
      { numRuns: 200 },
    );
  });
});
