import { describe, expect, it } from 'vitest';
import { Diagram } from './diagram';
import { PATH_LIMITS, parsePathSteps, resolvePath } from './path';

/**
 * Initial -OrderSubmitted-> Reserving -StockReserved-> Charging -PaymentCharged-> Completed;
 * Charging -PaymentFailed [retry]-> Reserving (a loop back) and -PaymentFailed [fraud]-> Cancelled
 * (two guards on one event); Any -Cancel-> Cancelled; Charging -Undo-> Reserving compensates.
 */
const saga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start', type: 'start', name: 'Initial' },
    { id: 'reserving', type: 'state', name: 'Reserving stock' },
    { id: 'charging', type: 'state', name: 'Charging payment' },
    { id: 'completed', type: 'end', name: 'Completed' },
    { id: 'cancelled', type: 'end', name: 'Cancelled' },
    { id: 'any', type: 'any', name: 'Any' },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'reserving', kind: 'forward', event: 'OrderSubmitted' },
    { id: 'e2', source: 'reserving', target: 'charging', kind: 'forward', event: 'StockReserved' },
    { id: 'e3', source: 'charging', target: 'completed', kind: 'forward', event: 'PaymentCharged' },
    {
      id: 'e4',
      source: 'charging',
      target: 'reserving',
      kind: 'forward',
      event: 'PaymentFailed',
      guard: 'retry',
    },
    {
      id: 'e5',
      source: 'charging',
      target: 'cancelled',
      kind: 'forward',
      event: 'PaymentFailed',
      guard: 'fraud',
    },
    { id: 'e6', source: 'any', target: 'cancelled', kind: 'forward', event: 'Cancel' },
    { id: 'e7', source: 'charging', target: 'reserving', kind: 'compensation', event: 'Undo' },
  ],
};

const events = (...names: string[]) => names.map((event) => ({ event }));

describe('resolvePath by events', () => {
  it('follows the events from the initial state', () => {
    const path = resolvePath(saga, events('OrderSubmitted', 'StockReserved', 'PaymentCharged'));
    expect(path.problems).toEqual([]);
    expect(path.nodes).toEqual(['start', 'reserving', 'charging', 'completed']);
    expect(path.transitions.map((t) => [t.edgeId, t.from, t.to])).toEqual([
      ['e1', 'start', 'reserving'],
      ['e2', 'reserving', 'charging'],
      ['e3', 'charging', 'completed'],
    ]);
    expect(path.current).toBe('completed');
    expect(path.finished).toBe(true);
  });

  it('is an unfinished path in a state that is not final', () => {
    const path = resolvePath(saga, events('OrderSubmitted', 'StockReserved'));
    expect(path.current).toBe('charging');
    expect(path.finished).toBe(false);
    expect(path.problems).toEqual([]);
  });

  it('is just the initial state without steps', () => {
    const path = resolvePath(saga, []);
    expect(path).toMatchObject({
      nodes: ['start'],
      current: 'start',
      finished: false,
      transitions: [],
    });
    expect(path.visits).toEqual({ start: 1 });
  });

  it('keeps the step and numbers the steps from 1', () => {
    const path = resolvePath(saga, [
      { event: 'OrderSubmitted', at: '2026-10-04T10:00:00Z', note: 'from the shop' },
    ]);
    expect(path.transitions[0]).toMatchObject({
      index: 0,
      step: { at: '2026-10-04T10:00:00Z', note: 'from the shop' },
    });
    expect(path.stepNumbers).toEqual({ e1: [1] });
  });
});

describe('resolvePath by states', () => {
  it('follows to a state by name or id when the transition is clear', () => {
    const path = resolvePath(saga, [{ state: 'Reserving stock' }, { state: 'charging' }]);
    expect(path.problems).toEqual([]);
    expect(path.transitions.map((t) => t.edgeId)).toEqual(['e1', 'e2']);
  });

  it('takes a leading step that names the initial state as the starting point', () => {
    const path = resolvePath(saga, [{ state: 'Initial' }, { state: 'Reserving stock' }]);
    expect(path.problems).toEqual([]);
    expect(path.transitions.map((t) => [t.index, t.edgeId])).toEqual([[1, 'e1']]);
    expect(path.stepNumbers).toEqual({ e1: [2] });
  });

  it('reports a state the current state cannot lead to', () => {
    const path = resolvePath(saga, [{ state: 'Completed' }]);
    expect(path.problems).toEqual([
      expect.objectContaining({
        index: 0,
        kind: 'no-transition',
        message: expect.stringContaining('Initial'),
      }),
    ]);
    expect(path.current).toBe('start');
  });

  it('combines an event with the state it leads to', () => {
    const path = resolvePath(saga, [
      ...events('OrderSubmitted', 'StockReserved'),
      { event: 'PaymentFailed', state: 'Reserving stock' },
    ]);
    expect(path.problems).toEqual([]);
    expect(path.transitions[2].edgeId).toBe('e4');
  });
});

describe('loops', () => {
  const loop = events('OrderSubmitted', 'StockReserved', 'PaymentFailed');

  it('counts visits and lists the step numbers of a transition taken twice', () => {
    const path = resolvePath(saga, [
      ...loop.slice(0, 2),
      { event: 'PaymentFailed', to: 'Reserving stock' },
      { event: 'StockReserved' },
      { event: 'PaymentCharged' },
    ]);
    expect(path.problems).toEqual([]);
    expect(path.stepNumbers).toEqual({ e1: [1], e2: [2, 4], e4: [3], e3: [5] });
    expect(path.visits).toEqual({ start: 1, reserving: 2, charging: 2, completed: 1 });
    expect(path.nodes).toHaveLength(6);
  });
});

describe('the Any state', () => {
  it('reacts in every state, but not in the initial or a final state', () => {
    const path = resolvePath(saga, events('OrderSubmitted', 'Cancel'));
    expect(path.transitions.map((t) => t.edgeId)).toEqual(['e1', 'e6']);
    expect(path.finished).toBe(true);
    expect(path.current).toBe('cancelled');
    expect(resolvePath(saga, events('Cancel')).problems[0].kind).toBe('no-transition');
    expect(resolvePath(saga, events('OrderSubmitted', 'Cancel', 'Cancel')).problems[0].kind).toBe(
      'after-final',
    );
  });
});

describe('guards and ambiguity', () => {
  const toCharging = events('OrderSubmitted', 'StockReserved');

  it('does not guess between transitions on the same event', () => {
    const path = resolvePath(saga, [
      ...toCharging,
      { event: 'PaymentFailed' },
      { event: 'StockReserved' },
    ]);
    expect(path.problems).toEqual([
      {
        index: 2,
        kind: 'ambiguous',
        message: expect.stringContaining(
          'Step 3: 2 transitions of “Charging payment” match event “PaymentFailed”',
        ),
        candidates: ['e4', 'e5'],
      },
    ]);
    // the path stops at the last good state; the steps after it are not drawn
    expect(path.current).toBe('charging');
    expect(path.transitions).toHaveLength(2);
    expect(path.finished).toBe(false);
  });

  it('is resolved by naming where the step went', () => {
    const path = resolvePath(saga, [...toCharging, { event: 'PaymentFailed', to: 'Cancelled' }]);
    expect(path.problems).toEqual([]);
    expect(path.transitions[2].edgeId).toBe('e5');
    expect(path.finished).toBe(true);
  });
});

describe('problems', () => {
  it('reports an event no transition reacts to, and stops there', () => {
    const path = resolvePath(saga, [...events('OrderSubmitted', 'Nonsense', 'StockReserved')]);
    expect(path.problems).toHaveLength(1);
    expect(path.problems[0]).toMatchObject({ index: 1, kind: 'no-transition' });
    expect(path.problems[0].message).toContain('Step 2');
    expect(path.problems[0].message).toContain('“Nonsense”');
    expect(path.nodes).toEqual(['start', 'reserving']);
    expect(path.finished).toBe(false);
  });

  it('does not offer compensation transitions', () => {
    const path = resolvePath(saga, [...events('OrderSubmitted', 'StockReserved', 'Undo')]);
    expect(path.problems[0].kind).toBe('no-transition');
  });

  it('reports a step that says nothing', () => {
    expect(resolvePath(saga, [{ note: 'hm' }, ...events('OrderSubmitted')]).problems).toEqual([
      expect.objectContaining({ index: 0, kind: 'empty-step' }),
    ]);
    expect(resolvePath(saga, [{ event: ' ' }]).problems[0].kind).toBe('empty-step');
  });

  it('reports a diagram without an initial state', () => {
    const path = resolvePath({ direction: 'top-bottom', nodes: [], edges: [] }, events('X'));
    expect(path.problems).toEqual([
      expect.objectContaining({ index: -1, kind: 'no-initial-state' }),
    ]);
    expect(path.nodes).toEqual([]);
    expect(path.current).toBeUndefined();
    expect(path.finished).toBe(false);
  });

  it('is not finished when a final state was reached and then something else was reported', () => {
    const path = resolvePath(saga, events('OrderSubmitted', 'Cancel', 'StockReserved'));
    expect(path.current).toBe('cancelled');
    expect(path.finished).toBe(false);
  });
});

describe('parsePathSteps', () => {
  it('reads a YAML list of event names and step objects', () => {
    expect(
      parsePathSteps(
        '- OrderSubmitted\n- { event: StockReserved, at: 2026-10-04T10:00:00Z, note: ok }\n- state: Completed\n  to: Done',
      ),
    ).toEqual({
      steps: [
        { event: 'OrderSubmitted' },
        { event: 'StockReserved', at: '2026-10-04T10:00:00Z', note: 'ok' },
        { state: 'Completed', to: 'Done' },
      ],
    });
  });

  it('reads JSON', () => {
    expect(parsePathSteps('[{"event":"A"},"B", {"state":"C"}]')).toEqual({
      steps: [{ event: 'A' }, { event: 'B' }, { state: 'C' }],
    });
  });

  it('treats empty text as an empty path and ignores unknown keys', () => {
    expect(parsePathSteps('  \n')).toEqual({ steps: [] });
    expect(parsePathSteps('- { event: A, extra: 1, at: 5 }')).toEqual({
      steps: [{ event: 'A', at: '5' }],
    });
  });

  it.each([
    ['[', /^Not valid JSON or YAML/],
    ['event: A', /list of steps/],
    ['- 3', /Step 1 is neither/],
    ['- A\n- [B]', /Step 2 is neither/],
    ['- { event: [A] }', /Step 1: `event` must be text/],
  ])('reports %j for people', (text, message) => {
    expect(parsePathSteps(text)).toEqual({ error: expect.stringMatching(message) });
  });
});

describe('parsePathSteps limits', () => {
  it('reads the most steps allowed, and refuses one more', () => {
    const steps = (n: number) => JSON.stringify(Array.from({ length: n }, () => 'Go'));
    const ok = parsePathSteps(steps(PATH_LIMITS.maxSteps));
    expect('steps' in ok && ok.steps).toHaveLength(PATH_LIMITS.maxSteps);
    expect(parsePathSteps(steps(PATH_LIMITS.maxSteps + 1))).toEqual({
      error: 'The path has 10001 steps; up to 10000 are read.',
    });
  });

  it('refuses text over 1 MB without parsing it', () => {
    const text = `- ${'x'.repeat(PATH_LIMITS.maxBytes)}`;
    expect(parsePathSteps(text)).toEqual({ error: 'The path is too long: up to 1 MB of text.' });
  });

  it('answers deep nesting with an error, not an exception', () => {
    const result = parsePathSteps('['.repeat(10_000) + ']'.repeat(10_000));
    expect('error' in result).toBe(true);
  });
});
