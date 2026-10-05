import orderSaga from '../../../docs/examples/order.saga.yaml?raw';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml?raw';
import { describe, expect, it } from 'vitest';
import { Diagram, DiagramEdge, DiagramNode } from './diagram';
import { parseDiagram } from './diagram-yaml';
import { Finding, RuleCode, findingsByElement, validate, worst } from './validation';

const node = (id: string, type: DiagramNode['type'] = 'state', extra: Partial<DiagramNode> = {}) =>
  ({ id, type, name: id, ...extra }) as DiagramNode;
const edge = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}) =>
  ({ id, source, target, kind: 'forward', ...extra }) as DiagramEdge;
const saga = (nodes: DiagramNode[], edges: DiagramEdge[]): Diagram => ({
  direction: 'top-bottom',
  nodes,
  edges,
});
const codes = (findings: Finding[]): RuleCode[] => findings.map((f) => f.code);
const only = (findings: Finding[], code: RuleCode) => findings.filter((f) => f.code === code);

/** A clean saga: initial → a → final, with sourced, well-named events. */
const clean = (): Diagram =>
  saga(
    [node('start', 'start'), node('a'), node('end', 'end')],
    [
      edge('e1', 'start', 'a'),
      edge('e2', 'a', 'end', { event: 'OrderShipped', eventSource: 'Warehouse' }),
    ],
  );

describe('validate', () => {
  it('has nothing to say about a clean saga, nor about a fresh diagram', () => {
    expect(validate(clean())).toEqual([]);
    expect(validate(saga([node('start', 'start')], []))).toEqual([]);
  });

  it('has nothing to say about the two example sagas', () => {
    for (const text of [orderSaga, travelBooking]) {
      const findings = validate(parseDiagram(text)).filter((f) => f.severity !== 'info');
      expect(findings).toEqual([]);
    }
  });

  describe('errors', () => {
    it('no initial state', () => {
      const findings = validate(
        saga([node('a'), node('end', 'end')], [edge('e', 'a', 'end', { event: 'Done' })]),
      );
      expect(only(findings, 'no-initial-state')).toMatchObject([{ severity: 'error' }]);
      // Every state would be unreachable, which is the same problem: not reported again.
      expect(codes(findings)).not.toContain('unreachable-state');
    });

    it('more than one initial state, on the second one', () => {
      const d = clean();
      d.nodes.push(node('start-2', 'start'));
      d.edges.push(edge('e3', 'start-2', 'a'));
      expect(only(validate(d), 'multiple-initial-states')).toMatchObject([
        { severity: 'error', elementId: 'start-2' },
      ]);
    });

    it('unreachable state, also behind another unreachable one', () => {
      const d = clean();
      d.nodes.push(node('lost'), node('lost-too'));
      d.edges.push(edge('e3', 'lost', 'lost-too', { event: 'Go', eventSource: 'X' }));
      expect(only(validate(d), 'unreachable-state').map((f) => f.elementId)).toEqual([
        'lost',
        'lost-too',
      ]);
    });

    it('treats what the Any node leads to as reachable', () => {
      const d = clean();
      d.nodes.push(node('any', 'any'), node('cancelling'));
      d.edges.push(
        edge('e3', 'any', 'cancelling', { event: 'CancelRequested', eventSource: 'Portal' }),
        edge('e4', 'cancelling', 'end', { event: 'RefundIssued', eventSource: 'Payments' }),
      );
      expect(codes(validate(d))).not.toContain('unreachable-state');
    });

    it('a transition into the initial state', () => {
      const d = clean();
      d.edges.push(edge('e3', 'a', 'start', { event: 'Restarted', eventSource: 'X' }));
      expect(only(validate(d), 'transition-into-initial')).toMatchObject([
        { severity: 'error', elementId: 'e3' },
      ]);
    });
  });

  describe('warnings', () => {
    it('a state with no way to a final state', () => {
      const d = clean();
      d.nodes.push(node('stuck'));
      d.edges.push(edge('e3', 'a', 'stuck', { event: 'Parked', eventSource: 'X' }));
      expect(only(validate(d), 'dead-end')).toMatchObject([
        { severity: 'warning', elementId: 'stuck' },
      ]);
    });

    it('a loop that never gets out is a dead end too', () => {
      const d = saga(
        [node('start', 'start'), node('a'), node('b'), node('end', 'end')],
        [
          edge('e1', 'start', 'a'),
          edge('e2', 'a', 'b', { event: 'Go', eventSource: 'X' }),
          edge('e3', 'b', 'a', { event: 'Back', eventSource: 'X' }),
        ],
      );
      expect(only(validate(d), 'dead-end').map((f) => f.elementId)).toEqual(['a', 'b']);
    });

    it('is not fooled by a way out through the Any node or a compensation transition', () => {
      const d = clean();
      d.nodes.push(node('b'));
      d.edges.push(edge('e3', 'a', 'b', { event: 'Parked', eventSource: 'X' }));
      d.edges.push(edge('e4', 'b', 'end', { kind: 'compensation', event: 'Undone' }));
      expect(only(validate(d), 'dead-end').map((f) => f.elementId)).toEqual(['b']);
    });

    it('the same event twice out of one state, without guards', () => {
      const d = clean();
      d.edges.push(edge('e3', 'a', 'end', { event: 'OrderShipped', eventSource: 'Warehouse' }));
      expect(only(validate(d), 'ambiguous-event').map((f) => f.elementId)).toEqual(['e2', 'e3']);
    });

    it('is fine when each transition on the event has a guard of its own', () => {
      const d = clean();
      d.edges[1].guard = 'express';
      d.edges.push(
        edge('e3', 'a', 'end', {
          event: 'OrderShipped',
          eventSource: 'Warehouse',
          guard: 'standard',
        }),
      );
      expect(codes(validate(d))).not.toContain('ambiguous-event');
    });

    it('is ambiguous again when two guards are the same, or one is missing', () => {
      const same = clean();
      same.edges[1].guard = 'big';
      same.edges.push(
        edge('e3', 'a', 'end', { event: 'OrderShipped', eventSource: 'W', guard: 'big' }),
      );
      expect(only(validate(same), 'ambiguous-event')).toHaveLength(2);
      const missing = clean();
      missing.edges[1].guard = 'big';
      missing.edges.push(edge('e3', 'a', 'end', { event: 'OrderShipped', eventSource: 'W' }));
      expect(only(validate(missing), 'ambiguous-event')).toHaveLength(2);
    });

    it('the same event out of two different states is not ambiguous', () => {
      const d = clean();
      d.nodes.push(node('b'));
      d.edges.push(
        edge('e3', 'start', 'b'),
        edge('e4', 'b', 'end', { event: 'OrderShipped', eventSource: 'Warehouse' }),
      );
      expect(codes(validate(d))).not.toContain('ambiguous-event');
    });

    it('a transition without an event, except out of the initial state', () => {
      const d = clean();
      d.nodes.push(node('b'));
      d.edges.push(
        edge('e3', 'a', 'b'),
        edge('e4', 'b', 'end', { event: 'Done', eventSource: 'X' }),
      );
      expect(only(validate(d), 'missing-event')).toMatchObject([
        { severity: 'warning', elementId: 'e3' },
      ]);
    });
  });

  describe('info', () => {
    it('an external event without a source, but not a timeout, reply or composite', () => {
      const d = clean();
      d.edges[1] = edge('e2', 'a', 'end', { event: 'OrderShipped' });
      expect(only(validate(d), 'external-without-source')).toMatchObject([
        { severity: 'info', elementId: 'e2' },
      ]);

      const timed = clean();
      timed.nodes[1] = node('a', 'state', {
        timers: [{ action: 'schedule', name: 'PaymentTimeout' }],
        requests: [{ name: 'CheckStock' }],
      });
      timed.edges = [
        edge('e1', 'start', 'a'),
        edge('e2', 'a', 'end', { event: 'PaymentTimeout' }),
        edge('e3', 'a', 'end', { event: 'CheckStock.Completed' }),
      ];
      expect(codes(validate(timed))).not.toContain('external-without-source');
    });

    it('does not ask for a source of an event the saga publishes itself', () => {
      const d = clean();
      d.nodes[1] = node('a', 'state', { activities: [{ kind: 'event', name: 'OrderShipped' }] });
      d.edges[1] = edge('e2', 'a', 'end', { event: 'OrderShipped' });
      expect(codes(validate(d))).not.toContain('external-without-source');
    });

    it('naming hints: commands are imperative, events past tense', () => {
      const d = clean();
      d.nodes[1] = node('a', 'state', {
        activities: [
          { kind: 'command', name: 'OrderShipped' },
          { kind: 'event', name: 'ShipOrder' },
          { kind: 'command', name: 'ShipOrder' },
        ],
      });
      d.edges[1] = edge('e2', 'a', 'end', { event: 'ShipOrder', eventSource: 'Warehouse' });
      const findings = validate(d);
      expect(only(findings, 'naming-command')).toMatchObject([
        { elementId: 'a', severity: 'info' },
      ]);
      expect(only(findings, 'naming-event').map((f) => f.elementId)).toEqual(['e2', 'a']);
    });
  });

  it('lists the findings in the order of the diagram, errors first by rule', () => {
    const d = clean();
    d.nodes.push(node('lost'));
    d.edges.push(edge('e3', 'a', 'start', { event: 'Restarted', eventSource: 'X' }));
    expect(codes(validate(d))).toEqual([
      'transition-into-initial',
      'unreachable-state',
      'dead-end',
    ]);
    expect(validate(d)).toEqual(validate(d));
  });

  it('ignores transitions to states that do not exist', () => {
    const d = clean();
    d.edges.push(edge('ghost', 'a', 'nope', { event: 'Boo' }));
    expect(validate(d)).toEqual([]);
  });
});

describe('helpers', () => {
  const findings: Finding[] = [
    { severity: 'info', code: 'naming-event', message: 'i', elementId: 'a' },
    { severity: 'warning', code: 'dead-end', message: 'w', elementId: 'a' },
    { severity: 'info', code: 'naming-event', message: 'i2', elementId: 'b' },
    { severity: 'error', code: 'no-initial-state', message: 'e' },
  ];

  it('worst() picks the most severe finding', () => {
    expect(worst(findings)).toBe('error');
    expect(worst(findings.slice(0, 3))).toBe('warning');
    expect(worst(findings.slice(0, 1))).toBe('info');
    expect(worst([])).toBeUndefined();
  });

  it('findingsByElement() groups by element and skips diagram-wide findings', () => {
    const byElement = findingsByElement(findings);
    expect([...byElement.keys()]).toEqual(['a', 'b']);
    expect(byElement.get('a')).toHaveLength(2);
  });
});

describe('routing slips (ADR 0023)', () => {
  const slip = (name: string, activities = [{ name: 'Reserve', compensates: true }]) => ({
    name,
    activities,
  });
  /** start → a (starts the slip) → done on Completed, failed on Faulted. */
  const withSlip = (extra: Partial<DiagramNode> = {}, more: DiagramEdge[] = []): Diagram =>
    saga(
      [
        node('start', 'start'),
        node('a', 'state', { routingSlips: [slip('Fulfil')], ...extra }),
        node('done', 'end'),
        node('failed', 'end'),
      ],
      [
        edge('e1', 'start', 'a', { event: 'OrderPlaced', eventSource: 'Shop' }),
        edge('e2', 'a', 'done', { event: 'Fulfil.Completed' }),
        edge('e3', 'a', 'failed', { event: 'Fulfil.Faulted' }),
        ...more,
      ],
    );
  const slipCodes = (d: Diagram) =>
    codes(validate(d)).filter((c) =>
      [
        'empty-routing-slip',
        'duplicate-routing-slip',
        'unhandled-slip-outcome',
        'slip-outcome-elsewhere',
      ].includes(c),
    );

  it('finds nothing in a slip whose outcomes are both handled, and does not call them external', () => {
    const findings = validate(withSlip());
    expect(slipCodes(withSlip())).toEqual([]);
    expect(findings.filter((f) => f.elementId === 'e2' || f.elementId === 'e3')).toEqual([]);
  });

  it('is an error for a slip without activities', () => {
    const findings = only(
      validate(withSlip({ routingSlips: [slip('Fulfil', [])] })),
      'empty-routing-slip',
    );
    expect(findings.map((f) => [f.severity, f.message])).toEqual([
      ['error', 'The routing slip “Fulfil” of “a” has no activities.'],
    ]);
  });

  it('is an error for two slips with one name, or a slip named like a request', () => {
    expect(
      only(
        validate(withSlip({ routingSlips: [slip('Fulfil'), slip('Fulfil')] })),
        'duplicate-routing-slip',
      ),
    ).toHaveLength(1);
    const clash = validate(withSlip({ requests: [{ name: 'Fulfil' }] }));
    expect(only(clash, 'duplicate-routing-slip').map((f) => f.message)).toEqual([
      'The routing slip “Fulfil” has the name of a request: their outcomes would be the same events.',
    ]);
  });

  it('warns about an outcome nothing reacts to, unless the Any state does', () => {
    const d = withSlip();
    d.edges = d.edges.filter((e) => e.id !== 'e3');
    expect(only(validate(d), 'unhandled-slip-outcome').map((f) => f.message)).toEqual([
      '“a” starts the routing slip “Fulfil” but nothing reacts to Fulfil.Faulted.',
    ]);
    d.nodes.push(node('any', 'any'));
    d.edges.push(edge('e9', 'any', 'failed', { event: 'Fulfil.Faulted' }));
    expect(only(validate(d), 'unhandled-slip-outcome')).toEqual([]);
  });

  it('warns about a transition on an outcome its state does not start', () => {
    const d = withSlip({}, [edge('e4', 'b', 'done', { event: 'Fulfil.Completed' })]);
    d.nodes.push(node('b'));
    d.edges.push(edge('e5', 'a', 'b', { event: 'Detour', eventSource: 'Shop' }));
    expect(
      only(validate(d), 'slip-outcome-elsewhere').map((f) => [f.elementId, f.message]),
    ).toEqual([['e4', '“b” reacts to Fulfil.Completed, but it does not start that routing slip.']]);
  });
});
