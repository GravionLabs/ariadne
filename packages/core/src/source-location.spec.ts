import { DiagramFormatError, parseDiagram } from './diagram-yaml';
import { isJsonText, jsonSyntaxProblem, locateSourceError } from './source-location';

/** The same two-node saga in both containers, with a bad value at `nodes[1].type`. */
const yamlBadType = [
  'version: 3',
  'nodes:',
  '  - { id: a, type: state, name: A }',
  '  - { id: b, type: nope, name: B }',
  '',
].join('\n');
const jsonBadType = [
  '{',
  '  "version": 3,',
  '  "nodes": [',
  '    { "id": "a", "type": "state", "name": "A" },',
  '    { "id": "b", "type": "nope", "name": "B" }',
  '  ]',
  '}',
].join('\n');

const yamlMissingName = ['version: 3', 'nodes:', '  - { id: a, type: state }', ''].join('\n');
const jsonMissingName = [
  '{',
  '  "version": 3,',
  '  "nodes": [',
  '    { "id": "a", "type": "state" }',
  '  ]',
  '}',
].join('\n');

const yamlDuplicate = [
  'version: 3',
  'nodes:',
  '  - { id: a, type: state, name: A }',
  '  - { id: a, type: state, name: B }',
  '',
].join('\n');
const jsonDuplicate = [
  '{',
  '  "version": 3,',
  '  "nodes": [',
  '    { "id": "a", "type": "state", "name": "A" },',
  '    { "id": "a", "type": "state", "name": "B" }',
  '  ]',
  '}',
].join('\n');

const yamlBadEdge = [
  'version: 3',
  'nodes:',
  '  - { id: a, type: state, name: A }',
  'edges:',
  '  - { id: e, source: a, target: zz }',
  '',
].join('\n');
const jsonBadEdge = [
  '{',
  '  "version": 3,',
  '  "nodes": [',
  '    { "id": "a", "type": "state", "name": "A" }',
  '  ],',
  '  "edges": [',
  '    { "id": "e", "source": "a", "target": "zz" }',
  '  ]',
  '}',
].join('\n');

function locate(text: string) {
  try {
    parseDiagram(text);
  } catch (e) {
    if (!(e instanceof DiagramFormatError)) throw e;
    return { message: e.message, at: locateSourceError(text, e.message) };
  }
  throw new Error('the text is valid');
}

describe.each([
  [
    'YAML',
    yamlBadType,
    yamlMissingName,
    yamlDuplicate,
    yamlBadEdge,
    { line: 4, column: 20 },
    { line: 3, column: 5 },
    { line: 4, column: 11 },
    { line: 5, column: 33 },
  ],
  [
    'JSON',
    jsonBadType,
    jsonMissingName,
    jsonDuplicate,
    jsonBadEdge,
    { line: 5, column: 26 },
    { line: 4, column: 5 },
    { line: 5, column: 13 },
    { line: 7, column: 43 },
  ],
])(
  'locateSourceError in %s',
  (name, badType, missingName, duplicate, badEdge, typeAt, parentAt, dupAt, edgeAt) => {
    it('places a bad value at the value', () => {
      const { message, at } = locate(badType);
      expect(message).toMatch(/^nodes\[1\]\.type must be one of/);
      expect(at).toMatchObject(typeAt);
    });

    it('places a missing required key at its parent object', () => {
      const { message, at } = locate(missingName);
      expect(message).toMatch(/^nodes\[0\]\.name/);
      expect(at).toMatchObject(parentAt);
    });

    it('places a duplicate id at the second node', () => {
      const { message, at } = locate(duplicate);
      expect(message).toBe('Duplicate node id "a"');
      expect(at).toMatchObject(dupAt);
    });

    it('places a reference to a missing node at the reference', () => {
      const { message, at } = locate(badEdge);
      expect(message).toMatch(/^edges\[0\]\.target "zz" is not a node/);
      expect(at).toMatchObject(edgeAt);
    });

    it('gives the end of the value', () => {
      const at = locateSourceError(badType, 'nodes[1].type must be one of x')!;
      expect(at.endLine).toBe(at.line);
      expect(at.endColumn - at.column).toBe(name === 'YAML' ? 4 : 6);
    });

    it('cannot place a message without a path', () => {
      expect(locateSourceError(badType, 'The file is too big')).toBeNull();
    });
  },
);

describe('JSON syntax errors', () => {
  const cases: [string, string, number, number, RegExp][] = [
    ['a missing comma', '{\n  "version": 3\n  "nodes": []\n}', 3, 3, /Expected "," or "}"/],
    ['a trailing comma', '{\n  "version": 3,\n}', 3, 1, /property name/],
    ['an unclosed string', '{\n  "version": "3\n}', 2, 14, /Unclosed string/],
    ['a missing colon', '{\n  "version" 3\n}', 2, 13, /Expected ":"/],
    ['a trailing comma in a list', '{"nodes": [1,]}', 1, 14, /Unexpected "\]"/],
    ['text after the value', '{} x', 1, 4, /after the end/],
    ['an unfinished object', '{"a": 1', 1, 8, /end of text/],
  ];

  it.each(cases)(
    'reports %s with line, column and a message about JSON',
    (_n, text, line, column, reason) => {
      const { message, at } = locate(text);
      expect(message).toMatch(/^Not valid JSON: /);
      expect(message).not.toMatch(/YAML/);
      expect(message).toMatch(reason);
      expect(message).toContain(`at line ${line}, column ${column}`);
      expect(at).toMatchObject({ line, column });
    },
  );

  it('counts \\r\\n as one line break', () => {
    const { at } = locate('{\r\n  "version": 3\r\n  "x": 1\r\n}');
    expect(at).toMatchObject({ line: 3, column: 3 });
  });

  it('answers deep nesting like YAML does', () => {
    const text = '{"a":'.repeat(5000) + '1' + '}'.repeat(5000);
    expect(() => parseDiagram(text)).toThrow(
      'The file is nested too deeply to be read as a diagram.',
    );
  });
});

describe('YAML syntax errors', () => {
  it('are placed where the parser found them', () => {
    const { message, at } = locate('version: 3\nnodes:\n  - id: a\n   type: x\n');
    expect(message).toMatch(/^Not valid YAML/);
    expect(at?.line).toBe(4);
  });
});

describe('YAML flow mapping', () => {
  it('is located as YAML, not JSON', () => {
    const text = '{version: 3,\n nodes: [}';
    const at = locateSourceError(text, 'Not valid YAML: whatever');
    expect(at).not.toBeNull();
  });
});

describe('isJsonText and jsonSyntaxProblem', () => {
  it('decide by the first character', () => {
    expect(isJsonText('  \n{"a": 1}')).toBe(true);
    expect(isJsonText('\uFEFF{}')).toBe(true);
    expect(isJsonText('{a: 1}'.replace('{', 'a: {'))).toBe(false);
    expect(isJsonText('version: 3')).toBe(false);
    expect(isJsonText('{version: 3, nodes: [], edges: []}')).toBe(false);
    expect(isJsonText('{ "version": 3 }')).toBe(true);
  });

  it('accepts valid JSON, with escapes and numbers', () => {
    expect(
      jsonSyntaxProblem('{"a": "x\\n\\u00e9", "b": [1, -2.5e3, true, null], "c": {}}'),
    ).toBeUndefined();
  });

  it('refuses a bad escape and a leading zero', () => {
    expect(jsonSyntaxProblem('{"a": "\\x"}')?.message).toMatch(/Bad escape/);
    expect(jsonSyntaxProblem('{"a": 01}')?.message).toMatch(/after the end|Expected/);
  });
});
