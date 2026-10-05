import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Diagram, parseDiagram, validate } from '@ariadne/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { diffDiagrams } from './diff';
import { generateSaga } from './generate';
import { importSagas } from './import';
import { createNodeParser } from './node';
import { CSharpParser } from './parser';

const samples = resolve(import.meta.dirname, '../../../samples/sagas');
let parser: CSharpParser;

beforeAll(async () => {
  parser = await createNodeParser();
});

/** Generates C# for `diagram` and reads it back. */
async function roundTrip(diagram: Diagram): Promise<Diagram> {
  const { files } = generateSaga(diagram);
  const { sagas } = await importSagas(files, parser);
  expect(sagas).toHaveLength(1);
  return sagas[0].diagram;
}

const goldens = readdirSync(samples).flatMap((dir) =>
  readdirSync(join(samples, dir))
    .filter((f) => f.endsWith('.saga.yaml'))
    .map((f) => ({ name: `${dir}/${f}`, path: join(samples, dir, f) })),
);

describe('generate → import', () => {
  it('has samples to check', () => {
    expect(goldens.length).toBeGreaterThanOrEqual(4);
  });

  it.each(goldens)('gives back the diagram of $name', async ({ path }) => {
    const diagram = parseDiagram(readFileSync(path, 'utf8'));
    const again = await roundTrip(diagram);
    expect(diffDiagrams(diagram, again)).toEqual([]);
    expect(validate(again).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('keeps guards: one guarded edge as When(E, filter), a pair as IfElse', async () => {
    const diagram: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 'b', type: 'state', name: 'Big' },
        { id: 'c', type: 'state', name: 'Small' },
        { id: 'z', type: 'end', name: 'Final' },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'forward',
          event: 'Placed',
          guard: 'amount > 100',
        },
        {
          id: 'e2',
          source: 'a',
          target: 'c',
          kind: 'forward',
          event: 'Placed',
          guard: '!(amount > 100)',
        },
        { id: 'e3', source: 'b', target: 'z', kind: 'forward', event: 'Done', guard: 'paid' },
        { id: 'e4', source: 'c', target: 'z', kind: 'forward', event: 'Done' },
      ],
    };
    const code = generateSaga(diagram).files.find((f) => f.path === 'SagaStateMachine.cs')!.content;
    expect(code).toContain('.IfElse(context => true /* TODO guard: amount > 100 */,');
    const again = await roundTrip(diagram);
    expect(again.edges.map((e) => [e.source, e.target, e.event, e.guard])).toEqual(
      [
        ['a', 'b', 'Placed', 'amount > 100'],
        ['a', 'c', 'Placed', '!(amount > 100)'],
        ['b', 'z', 'Done', 'paid'],
        ['c', 'z', 'Done', undefined],
      ].map(([s, t, ...rest]) => [
        again.nodes.find(
          (n) => n.name === { a: 'Initial', b: 'Big', c: 'Small', z: 'Final' }[s as string],
        )!.id,
        again.nodes.find(
          (n) => n.name === { a: 'Initial', b: 'Big', c: 'Small', z: 'Final' }[t as string],
        )!.id,
        ...rest,
      ]),
    );
  });

  it('keeps the saga metadata of the diagram', async () => {
    const diagram = parseDiagram(readFileSync(goldens[0].path, 'utf8'));
    const again = await roundTrip(diagram);
    expect(again.saga).toEqual(diagram.saga);
    expect(again.events).toEqual(diagram.events);
  });

  it('survives names that are not identifiers, outside events, DuringAny and Ignore', async () => {
    const diagram: Diagram = {
      saga: { className: 'FlowMachine', namespace: 'Acme' },
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        {
          id: 'b',
          type: 'state',
          name: 'waiting for payment',
          activities: [
            { kind: 'command', name: 'charge card' },
            { kind: 'event', name: 'PaymentRequested' },
          ],
          ignores: ['Ping'],
        },
        { id: 'c', type: 'state', name: 'Shipping' },
        { id: 'x', type: 'any', name: 'Any' },
        { id: 'z', type: 'end', name: 'Final' },
      ],
      edges: [
        {
          id: '1',
          source: 'a',
          target: 'b',
          kind: 'forward',
          event: 'order placed',
          eventSource: 'Shop',
        },
        {
          id: '2',
          source: 'b',
          target: 'c',
          kind: 'forward',
          event: 'PaymentCharged',
          guard: 'amount > 0',
        },
        { id: '3', source: 'b', target: 'b', kind: 'forward', event: 'PaymentRetried' },
        { id: '4', source: 'c', target: 'z', kind: 'forward', event: 'Shipped' },
        { id: '5', source: 'x', target: 'z', kind: 'forward', event: 'Cancelled' },
      ],
    };
    expect(diffDiagrams(diagram, await roundTrip(diagram))).toEqual([]);
  });
});

describe('diffDiagrams', () => {
  const base = (): Diagram => ({
    direction: 'top-bottom',
    nodes: [
      { id: 'a', type: 'start', name: 'Initial' },
      { id: 'b', type: 'state', name: 'Working', activities: [{ kind: 'command', name: 'DoIt' }] },
      { id: 'z', type: 'end', name: 'Final' },
    ],
    edges: [
      { id: '1', source: 'a', target: 'b', kind: 'forward', event: 'Started' },
      { id: '2', source: 'b', target: 'z', kind: 'forward', event: 'Done' },
    ],
  });

  it('finds nothing between a diagram and itself, whatever the layout and notes say', () => {
    const other = base();
    other.name = 'Another title';
    other.nodes[1].description = 'Notes';
    other.nodes[1].color = 'red';
    other.direction = 'left-right';
    expect(diffDiagrams(base(), other)).toEqual([]);
  });

  it('compares names as the identifiers the code would have', () => {
    const other = base();
    other.nodes[1].name = 'working';
    expect(diffDiagrams(base(), other)).toEqual([]);
  });

  it('lists missing and extra states, transitions and activities', () => {
    const code = base();
    code.nodes[1].name = 'Busy';
    code.nodes[1].activities = [{ kind: 'event', name: 'Started' }];
    code.edges[1].event = 'Finished';
    const messages = diffDiagrams(base(), code).map((d) => `${d.kind} ${d.change}: ${d.message}`);
    expect(messages).toEqual([
      'state missing: State Working is in the diagram, not in the code.',
      'state extra: State Busy is in the code, not in the diagram.',
      'transition missing: Transition Initial → Working on Started is in the diagram, not in the code.',
      'transition missing: Transition Working → Final on Done is in the diagram, not in the code.',
      'transition extra: Transition Initial → Busy on Started is in the code, not in the diagram.',
      'transition extra: Transition Busy → Final on Finished is in the code, not in the diagram.',
      'activity missing: State Working sends DoIt is in the diagram, not in the code.',
      'activity extra: State Busy publishes Started is in the code, not in the diagram.',
    ]);
  });

  it('reports a changed message type or correlation of an event', () => {
    const code = base();
    code.events = [
      {
        name: 'Started',
        messageType: 'StartRequested',
        correlation: 'CorrelateById(m => m.Message.Id)',
      },
    ];
    expect(diffDiagrams(base(), code)).toEqual([
      {
        kind: 'event',
        change: 'changed',
        message:
          'Event Started is Started, correlated by CorrelationId in the diagram, StartRequested, correlated by CorrelateById(m => m.Message.Id) in the code.',
      },
    ]);
  });
});
