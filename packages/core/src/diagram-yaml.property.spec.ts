import * as fc from 'fast-check';
import { parse, stringify } from 'yaml';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  NODE_COLORS,
  NodeColor,
  NodeType,
  SagaInfo,
  EventInfo,
  DIRECTIONS,
} from './diagram';
import { DiagramFormatError, parseDiagram, serializeDiagram } from './diagram-yaml';
import { parsePathSteps } from './path';

const RUNS = { numRuns: 300 };

// ---- awkward text

/** Words and shapes YAML would read as something other than a string if they were not quoted. */
const YAML_SPECIAL = [
  'yes',
  'no',
  'on',
  'off',
  'null',
  '~',
  'true',
  'false',
  '1e3',
  '0x10',
  '0o7',
  '.inf',
  '-.inf',
  '.nan',
  '2026-10-04',
  '12:30:45',
  '1_000',
  '-',
  '- a',
  '? a',
  '[a, b]',
  '{a: b}',
  '*alias',
  '&anchor',
  '!tag',
  '|',
  '>',
  '%YAML',
  '---',
  '...',
  '"quoted"',
  "'single'",
];

/** Text with no leading or trailing space, which the reader trims in some fields. */
const trimmed = (text: string) => text.trim();

const awkwardText: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ unit: 'grapheme', maxLength: 24 }) },
  { weight: 2, arbitrary: fc.constantFrom(...YAML_SPECIAL) },
  {
    weight: 2,
    arbitrary: fc.constantFrom('a: b', 'a #b', ' lead', 'trail ', 'two\nlines', 'tab\there'),
  },
  { weight: 1, arbitrary: fc.constantFrom('é', 'ü', '日本語', '🚀', 'a b', 'x y') },
  { weight: 1, arbitrary: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_.]{0,15}$/) },
);

/** Non-empty text, as the reader requires for ids, names and the like. */
const nonEmpty = awkwardText.filter((s) => s !== '');
/** An optional free-text field: absent or any text, empty included. */
const optionalText = fc.option(awkwardText, { nil: undefined });
/** An optional field the reader trims and drops when blank, so only text that survives that. */
const optionalTrimmed = fc.option(
  awkwardText.map(trimmed).filter((s) => s !== ''),
  { nil: undefined },
);

// ---- the model

const colors: fc.Arbitrary<NodeColor> = fc.oneof(
  fc.constantFrom(...NODE_COLORS),
  fc
    .array(fc.constantFrom(...'0123456789abcdefABCDEF'.split('')), { minLength: 6, maxLength: 6 })
    .map((digits) => `#${digits.join('')}` as NodeColor),
);

const nonEmptyList = <T>(item: fc.Arbitrary<T>) =>
  fc.option(fc.array(item, { minLength: 1, maxLength: 3 }), { nil: undefined });

const sagaInfo: fc.Arbitrary<SagaInfo | undefined> = fc
  .record(
    {
      className: optionalTrimmed,
      namespace: optionalTrimmed,
      instanceType: optionalTrimmed,
      stateProperty: optionalTrimmed,
      contractsNamespace: optionalTrimmed,
      source: optionalTrimmed,
    },
    { requiredKeys: [] },
  )
  .map((saga) => {
    const defined = Object.fromEntries(Object.entries(saga).filter(([, v]) => v !== undefined));
    return Object.keys(defined).length ? (defined as SagaInfo) : undefined;
  });

const eventInfos: fc.Arbitrary<EventInfo[] | undefined> = fc
  .uniqueArray(nonEmpty, { maxLength: 3 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc
          .record(
            { messageType: optionalTrimmed, correlation: optionalTrimmed },
            { requiredKeys: [] },
          )
          .map((rest) => ({ name, ...rest }) as EventInfo),
      ),
    ),
  )
  .map((events) => (events.length ? events : undefined));

const NODE_TYPE_LIST: readonly NodeType[] = ['start', 'end', 'state', 'any', 'join'];

/** A node of the given type, with the fields that type may have. */
function nodeOf(id: string, type: NodeType): fc.Arbitrary<DiagramNode> {
  const common = {
    name: nonEmpty,
    description: optionalText,
    color: fc.option(colors, { nil: undefined }),
    retry: optionalText,
    timeout: optionalText,
    compensation: fc.option(
      fc.record({ name: nonEmpty, description: optionalText }, { requiredKeys: ['name'] }),
      { nil: undefined },
    ),
  };
  const stateOnly =
    type === 'state'
      ? {
          activities: nonEmptyList(
            fc.record({
              kind: fc.constantFrom('command' as const, 'event' as const),
              name: nonEmpty,
            }),
          ),
          ignores: nonEmptyList(nonEmpty),
          requests: nonEmptyList(
            fc.record({ name: nonEmpty, timeout: optionalTrimmed }, { requiredKeys: ['name'] }),
          ),
          routingSlips: nonEmptyList(
            fc.record({
              name: nonEmpty,
              activities: fc.array(
                fc.record(
                  { name: nonEmpty, compensates: fc.constant(true as const) },
                  { requiredKeys: ['name'] },
                ),
                { maxLength: 4 },
              ),
            }),
          ),
          timers: nonEmptyList(
            fc.oneof(
              fc.record({
                action: fc.constant('schedule' as const),
                name: nonEmpty,
                delay: optionalTrimmed,
              }),
              fc.record({ action: fc.constant('unschedule' as const), name: nonEmpty }),
            ),
          ),
        }
      : {};
  return fc
    .record({ ...common, ...stateOnly }, { requiredKeys: ['name'] })
    .map((fields) => ({ id, type, ...dropUndefined(fields) }) as DiagramNode);
}

const dropUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/** A diagram the model allows: unique node ids, at most one `any`, edges between existing nodes. */
const diagrams: fc.Arbitrary<Diagram> = fc
  .record({
    ids: fc.uniqueArray(nonEmpty, { minLength: 1, maxLength: 6 }),
    types: fc.array(fc.constantFrom(...NODE_TYPE_LIST), { minLength: 6, maxLength: 6 }),
  })
  .chain(({ ids, types }) => {
    let anySeen = false;
    const nodeTypes = ids.map((_, i) => {
      const type = types[i];
      if (type !== 'any') return type;
      if (anySeen) return 'state';
      anySeen = true;
      return type;
    });
    const edge = fc
      .record(
        {
          id: nonEmpty,
          source: fc.constantFrom(...ids),
          target: fc.constantFrom(...ids),
          kind: fc.constantFrom('forward' as const, 'compensation' as const),
          event: fc.option(nonEmpty, { nil: undefined }),
          eventSource: fc.option(nonEmpty, { nil: undefined }),
          guard: optionalTrimmed,
        },
        { requiredKeys: ['id', 'source', 'target', 'kind'] },
      )
      // A guard is a condition on an event.
      .map((e): DiagramEdge => dropUndefined(e.event ? e : { ...e, guard: undefined }));
    return fc.record(
      {
        name: optionalTrimmed,
        description: optionalTrimmed,
        saga: sagaInfo,
        events: eventInfos,
        direction: fc.constantFrom(...DIRECTIONS),
        // `normal` is the default and reads back as absent, like an unset spacing.
        spacing: fc.constantFrom('compact' as const, 'spacious' as const),
        nodes: fc
          .tuple(...ids.map((id, i) => nodeOf(id, nodeTypes[i])))
          .map((n) => n as DiagramNode[]),
        edges: fc.array(edge, { maxLength: 8 }),
      },
      { requiredKeys: ['direction', 'nodes', 'edges'] },
    );
  })
  .map((diagram) => dropUndefined(diagram) as Diagram);

// ---- the properties

describe('diagram file, property-based', () => {
  it('reads back what it wrote', () => {
    fc.assert(
      fc.property(diagrams, (diagram) => {
        expect(parseDiagram(serializeDiagram(diagram))).toEqual(diagram);
      }),
      RUNS,
    );
  });

  it('writes the same text again after reading it', () => {
    fc.assert(
      fc.property(diagrams, (diagram) => {
        const text = serializeDiagram(diagram);
        expect(serializeDiagram(parseDiagram(text))).toBe(text);
      }),
      RUNS,
    );
  });
});

/** The reader's whole contract for bad input: a diagram, or a format error. */
function readsOrFormatError(text: string): void {
  try {
    parseDiagram(text);
  } catch (e) {
    expect(e, `threw ${String(e)}`).toBeInstanceOf(DiagramFormatError);
  }
}

// ---- bad input

/** Any JSON-like value, to be written as YAML. */
const jsonValues = fc.json().map((text) => JSON.parse(text) as unknown);

/** A random scalar, list or mapping, to put where something else was. */
const replacements: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(null, true, false, 0, -1, 1.5, '', 'x', '[]', '{}'),
  fc.string({ maxLength: 12 }),
  fc.integer(),
  fc.array(fc.oneof(fc.string({ maxLength: 6 }), fc.integer()), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 6 }), fc.oneof(fc.string({ maxLength: 6 }), fc.integer()), {
    maxKeys: 3,
  }),
);

const validTexts = diagrams.map(serializeDiagram);

/** Replaces one value, picked by `pick` (0..1) among those at most `maxDepth` deep, in a parsed file. */
function replaceValue(
  root: unknown,
  pick: number,
  maxDepth: number,
  replacement: unknown,
): unknown {
  const paths: (string | number)[][] = [];
  const walk = (value: unknown, path: (string | number)[]) => {
    paths.push(path);
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, [...path, i]));
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
  };
  walk(root, []);
  // Shallow paths are the containers (`nodes`, `edges`, `saga`, ...): the likeliest to be confused.
  const shallow = paths.filter((p) => p.length <= maxDepth);
  const path = shallow[Math.floor(pick * shallow.length)];
  if (path.length === 0) return replacement;
  const copy = structuredClone(root) as Record<string | number, unknown>;
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path[path.length - 1]] = replacement;
  return copy;
}

describe('bad input to the diagram reader, property-based', () => {
  it('turns arbitrary text into a diagram or a format error', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 200 }), readsOrFormatError), RUNS);
  });

  it('turns arbitrary values written as YAML into a diagram or a format error', () => {
    fc.assert(
      fc.property(jsonValues, (value) => readsOrFormatError(stringify(value))),
      RUNS,
    );
  });

  it('turns a valid file with a line deleted, duplicated or cut off into a diagram or a format error', () => {
    fc.assert(
      fc.property(
        validTexts,
        fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
        fc.constantFrom('delete', 'duplicate', 'truncate-line', 'truncate-file'),
        (text, pick, how) => {
          const lines = text.split('\n');
          const at = Math.floor(pick * lines.length);
          if (how === 'delete') lines.splice(at, 1);
          else if (how === 'duplicate') lines.splice(at, 0, lines[at]);
          else if (how === 'truncate-line') lines[at] = lines[at].slice(0, Math.floor(pick * 13));
          else lines.length = at;
          readsOrFormatError(lines.join('\n'));
        },
      ),
      RUNS,
    );
  });

  it('turns a valid file with one value replaced into a diagram or a format error', () => {
    fc.assert(
      fc.property(
        validTexts,
        fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
        fc.integer({ min: 1, max: 4 }),
        replacements,
        (text, pick, maxDepth, replacement) => {
          readsOrFormatError(stringify(replaceValue(parse(text), pick, maxDepth, replacement)));
        },
      ),
      RUNS,
    );
  });
});

describe('bad input to the path reader, property-based', () => {
  const returnsStepsOrError = (text: string) => {
    const result = parsePathSteps(text);
    expect('steps' in result || ('error' in result && result.error.length > 0)).toBe(true);
  };

  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), returnsStepsOrError),
      RUNS,
    );
  });

  it('never throws on arbitrary values written as YAML or JSON', () => {
    fc.assert(
      fc.property(jsonValues, (value) => {
        returnsStepsOrError(stringify(value));
        returnsStepsOrError(JSON.stringify(value));
      }),
      RUNS,
    );
  });
});
