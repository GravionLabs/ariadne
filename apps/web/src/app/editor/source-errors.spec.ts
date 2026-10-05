import { locateSourceError } from './source-errors';
import { DiagramFormatError, parseDiagram } from '@ariadne/core';

/** The message `parseDiagram` gives for `text`, and where we place it. */
function locate(text: string) {
  try {
    parseDiagram(text);
  } catch (e) {
    if (!(e instanceof DiagramFormatError)) throw e;
    return { message: e.message, at: locateSourceError(text, e.message) };
  }
  throw new Error('the text is valid');
}

describe('locateSourceError', () => {
  it('places YAML syntax errors where the parser found them', () => {
    const { message, at } = locate('version: 3\nnodes:\n  - id: a\n   type: x\n');
    expect(message).toMatch(/^Not valid YAML/);
    expect(at?.line).toBe(4);
  });

  it('places a bad value at the value', () => {
    const text = 'version: 3\nnodes:\n  - { id: a, type: task, name: A }\n';
    const { message, at } = locate(text);
    expect(message).toMatch(/^nodes\[0\]\.type must be one of/);
    expect(at).toEqual({ line: 3, column: 20 });
  });

  it('places errors in nested lists at the item', () => {
    const text = [
      'version: 3',
      'nodes:',
      '  - id: a',
      '    type: state',
      '    name: A',
      '    activities:',
      '      - command: ChargePayment',
      '      - query: GetOrder',
      '',
    ].join('\n');
    const { message, at } = locate(text);
    expect(message).toMatch(/^nodes\[0\]\.activities\[1\] must be/);
    expect(at).toEqual({ line: 8, column: 9 });
  });

  it('places an unknown reference at the reference', () => {
    const text = [
      'version: 3',
      'nodes:',
      '  - { id: a, type: state, name: A }',
      'edges:',
      '  - { id: e, source: a, target: zz }',
      '',
    ].join('\n');
    const { message, at } = locate(text);
    expect(message).toBe('edges[0].target "zz" is not a node');
    expect(at).toEqual({ line: 5, column: 33 });
  });

  it('places a missing value at the item that lacks it', () => {
    const text = 'version: 3\nnodes:\n  - id: a\n    type: state\n';
    const { message, at } = locate(text);
    expect(message).toMatch(/^nodes\[0\]\.name must be a non-empty string/);
    expect(at).toEqual({ line: 3, column: 5 });
  });

  it('places a duplicate id at the second node', () => {
    const text = [
      'version: 3',
      'nodes:',
      '  - { id: a, type: state, name: A }',
      '  - { id: b, type: state, name: B }',
      '  - { id: a, type: state, name: C }',
      '',
    ].join('\n');
    const { message, at } = locate(text);
    expect(message).toBe('Duplicate node id "a"');
    expect(at).toEqual({ line: 5, column: 11 });
  });

  it('places top-level problems at their key', () => {
    expect(locate('version: 9\n').at).toEqual({ line: 1, column: 10 });
    expect(locate('version: 3\nnodes: {}\n').at).toEqual({ line: 2, column: 8 });
  });

  it('gives up on messages without a place', () => {
    expect(locateSourceError('version: 3\n', 'Something else')).toBeNull();
    expect(locate('- 1\n').at).toBeNull(); // "file must be a mapping"
  });
});
