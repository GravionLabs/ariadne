import { checkDiagramText } from './yaml-diagnostics';

const LINES = (...lines: string[]) => lines.join('\n') + '\n';

const GOOD = LINES(
  'version: 3',
  'name: Order Saga',
  'direction: top-bottom',
  'nodes:',
  '  - id: start-1',
  '    type: start',
  '    name: Initial',
  '  - id: state-1',
  '    type: state',
  '    name: Submitted',
  '  - id: end-1',
  '    type: end',
  '    name: Completed',
  'edges:',
  '  - id: edge-1',
  '    source: start-1',
  '    target: state-1',
  '    kind: forward',
  '    event: OrderSubmitted',
  '    eventSource: Shop',
  '  - id: edge-2',
  '    source: state-1',
  '    target: end-1',
  '    kind: forward',
  '    event: OrderShipped',
  '    eventSource: Shop',
);

describe('checkDiagramText', () => {
  it('finds nothing wrong with a good diagram', () => {
    expect(checkDiagramText(GOOD)).toEqual([]);
  });

  describe('YAML syntax', () => {
    it('reports an error with its position', () => {
      const problems = checkDiagramText(LINES('version: 3', 'nodes: [unclosed', 'edges: []'));
      expect(problems.length).toBeGreaterThan(0);
      expect(problems[0]).toMatchObject({ severity: 'error' });
      expect(problems[0]!.message).toMatch(/^Not valid YAML/);
      expect(problems[0]!.range.line).toBeGreaterThanOrEqual(1);
    });

    it('reports a file that is empty', () => {
      const [problem] = checkDiagramText('');
      expect(problem).toMatchObject({ severity: 'error', range: { line: 0 } });
    });
  });

  describe('what the reader rejects', () => {
    it('puts a wrong field on that field', () => {
      const text = GOOD.replace('type: state', 'type: step');
      const [problem] = checkDiagramText(text);
      expect(problem!.message).toMatch(/nodes\[1\]\.type must be one of/);
      expect(problem!.range).toMatchObject({ line: 8 });
      // The value `step`, not the whole line.
      expect(
        text.split('\n')[8]!.slice(problem!.range.character, problem!.range.endCharacter),
      ).toBe('step');
    });

    it('puts a missing field on the item that lacks it', () => {
      const text = GOOD.replace('    name: Submitted\n', '');
      const [problem] = checkDiagramText(text);
      expect(problem!.message).toMatch(/nodes\[1\]\.name must be a non-empty string/);
      expect(problem!.range.line).toBe(7);
    });

    it('puts an edge to nowhere on its target', () => {
      const text = GOOD.replace('target: end-1', 'target: nowhere');
      const [problem] = checkDiagramText(text);
      expect(problem!.message).toMatch(/is not a node/);
      expect(text.split('\n')[problem!.range.line]).toContain('target: nowhere');
    });

    it('puts a duplicate id on the second node', () => {
      const text = GOOD.replace('id: end-1', 'id: state-1');
      const [problem] = checkDiagramText(text);
      expect(problem!.message).toBe('Duplicate node id "state-1"');
      expect(problem!.range.line).toBe(10);
    });

    it('puts a second any node on its type', () => {
      const text = GOOD.replace('type: end', 'type: any').replace('type: start', 'type: any');
      const [problem] = checkDiagramText(text);
      expect(problem!.message).toMatch(/only one node of type "any"/);
      expect(problem!.range.line).toBe(11);
    });

    it('puts an unsupported version on the version', () => {
      const [problem] = checkDiagramText(GOOD.replace('version: 3', 'version: 9'));
      expect(problem!.message).toMatch(/Unsupported format version/);
      expect(problem!.range.line).toBe(0);
    });

    it('falls back to the first line for what has no place', () => {
      const [problem] = checkDiagramText('- just\n- a list\n');
      expect(problem).toMatchObject({ severity: 'error', range: { line: 0 } });
    });
  });

  describe('findings of the validation', () => {
    it('reports a state nothing leads to, on its name, with its rule', () => {
      const text = GOOD.replace('target: state-1', 'target: end-1');
      const found = checkDiagramText(text).find((p) => p.code === 'unreachable-state');
      expect(found).toMatchObject({ severity: 'error' });
      expect(text.split('\n')[found!.range.line]).toContain('name: Submitted');
    });

    it('reports a transition without an event, on the transition', () => {
      const text = GOOD.replace('    event: OrderShipped\n    eventSource: Shop\n', '');
      const found = checkDiagramText(text).find((p) => p.code === 'missing-event');
      expect(found).toMatchObject({ severity: 'warning' });
      expect(text.split('\n')[found!.range.line]).toContain('id: edge-2');
    });

    it('reports a finding about the whole diagram on the nodes', () => {
      const text = GOOD.replace('type: start', 'type: state');
      const found = checkDiagramText(text).find((p) => p.code === 'no-initial-state');
      expect(found).toBeDefined();
      expect(text.split('\n')[found!.range.line]).toBe('nodes:');
    });

    it('reports hints as information', () => {
      const text = GOOD.replace('event: OrderSubmitted', 'event: SubmitOrder');
      const hint = checkDiagramText(text).find((p) => p.code === 'naming-event');
      expect(hint).toMatchObject({ severity: 'info' });
    });
  });

  it('says that an older file will be migrated, on its version', () => {
    const old = GOOD.replace('version: 3', 'version: 2');
    const note = checkDiagramText(old).find((p) => p.severity === 'info' && p.code === undefined);
    // A version 2 file without activities on edges needs no migration note.
    expect(note).toBeUndefined();
    const withActivity = old.replace(
      '    kind: forward\n    event: OrderSubmitted',
      '    kind: forward\n    activities:\n      - event: X\n    event: OrderSubmitted',
    );
    const migrated = checkDiagramText(withActivity).find((p) =>
      /moved from transitions/.test(p.message),
    );
    expect(migrated).toMatchObject({ severity: 'info', range: { line: 0 } });
  });
});
