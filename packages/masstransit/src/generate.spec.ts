import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Diagram, parseDiagram } from '@ariadne/core';
import { describe, expect, it } from 'vitest';
import { generateSaga, identifier } from './generate';

const samples = resolve(import.meta.dirname, '../../../samples/sagas');
const golden = (dir: string, name: string): Diagram =>
  parseDiagram(readFileSync(join(samples, dir, `${name}.saga.yaml`), 'utf8'));

const file = (d: Diagram, path: string) =>
  generateSaga(d).files.find((f) => f.path === path)?.content;

describe('identifier', () => {
  it('joins words in PascalCase and keeps capitals inside a word', () => {
    expect(identifier('charging payment')).toBe('ChargingPayment');
    expect(identifier('OrderSubmitted')).toBe('OrderSubmitted');
    expect(identifier('3d secure')).toBe('_3dSecure');
    expect(identifier('class')).toBe('Class');
    expect(identifier('  ', 'Item')).toBe('Item');
  });
});

describe('generateSaga', () => {
  const order = golden('order', 'OrderStateMachine');

  it('writes the state machine, the saga instance and the contracts', () => {
    const { files, warnings } = generateSaga(order);
    expect(files.map((f) => f.path)).toEqual([
      'OrderStateMachine.cs',
      'OrderState.cs',
      'Contracts.cs',
    ]);
    expect(warnings).toEqual([]);
  });

  it('is deterministic', () => {
    expect(generateSaga(order)).toEqual(generateSaga(structuredClone(order)));
  });

  it('matches the snapshot of the order saga', () => {
    const { files } = generateSaga(order);
    for (const f of files) expect(f.content).toMatchSnapshot(f.path);
  });

  it('puts the first transitions in Initially, the others in During and finalizes', () => {
    const code = file(order, 'OrderStateMachine.cs')!;
    expect(code).toContain('Initially(\n');
    expect(code).toContain('During(ReservingStock,');
    expect(code).toContain('.Finalize()');
    expect(code).toContain('SetCompletedWhenFinalized();');
    expect(code).toContain('x => x.CorrelateById(context => context.Message.OrderId)');
  });

  it('enters states with WhenEnter and leaves the properties as TODO', () => {
    const code = file(order, 'OrderStateMachine.cs')!;
    expect(code).toContain('WhenEnter(ChargingPayment, binder => binder');
    expect(code).toContain('.Send(context => new ChargePayment { CorrelationId');
    expect(code).toContain('TODO: set the other properties');
  });

  it('names the source of external events and keeps guards as TODO', () => {
    const d: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 'b', type: 'state', name: 'waiting for payment' },
      ],
      edges: [
        {
          id: 'e',
          source: 'a',
          target: 'b',
          kind: 'forward',
          event: 'OrderPlaced',
          eventSource: 'Shop API',
          guard: 'amount > 100 */',
        },
      ],
    };
    const code = file(d, 'SagaStateMachine.cs')!;
    expect(code).toContain('Event(() => OrderPlaced); // from Shop API');
    expect(code).toContain('When(OrderPlaced, context => true /* TODO guard: amount > 100 * / */)');
    expect(code).toContain('public State WaitingForPayment');
  });

  it('uses DuringAny, Ignore and the namespaces of the diagram', () => {
    const d: Diagram = {
      saga: {
        className: 'FlowMachine',
        namespace: 'Acme.Flows',
        contractsNamespace: 'Acme.Contracts',
      },
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 's', type: 'state', name: 'Running', ignores: ['Ping'] },
        { id: 'x', type: 'any', name: 'Any' },
        { id: 'z', type: 'end', name: 'Final' },
      ],
      edges: [
        { id: '1', source: 'a', target: 's', kind: 'forward', event: 'Started' },
        { id: '2', source: 'x', target: 'z', kind: 'forward', event: 'Cancelled' },
      ],
    };
    const { files } = generateSaga(d);
    expect(files.map((f) => f.path)).toEqual(['FlowMachine.cs', 'SagaState.cs', 'Contracts.cs']);
    const code = files[0].content;
    expect(code).toContain('namespace Acme.Flows;');
    expect(code).toContain('using Acme.Contracts;');
    expect(code).toContain('Ignore(Ping)');
    expect(code).toContain('DuringAny(');
    expect(files[2].content).toContain('namespace Acme.Contracts;');
  });

  it('renames clashing identifiers and says so', () => {
    const d: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 's', type: 'state', name: 'Shipped' },
      ],
      edges: [{ id: '1', source: 'a', target: 's', kind: 'forward', event: 'Shipped' }],
    };
    const { files, warnings } = generateSaga(d);
    expect(files[0].content).toContain('Event<Shipped> Shipped2');
    expect(warnings).toEqual(['Event "Shipped" is called Shipped2 in code: Shipped is taken.']);
  });

  it('reports what it cannot generate', () => {
    const d: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 's', type: 'state', name: 'Checking', requests: [{ name: 'Validate' }] },
        { id: 'z', type: 'end', name: 'Final' },
      ],
      edges: [
        { id: '1', source: 'a', target: 's', kind: 'forward' },
        { id: '2', source: 's', target: 'z', kind: 'forward', event: 'Validate.Completed' },
      ],
    };
    expect(generateSaga(d).warnings).toEqual([
      'The transition Initial → Checking has no event: not generated.',
      'Validate.Completed is the answer of a request, which is not generated yet.',
      'The requests of state Checking are not generated yet.',
    ]);
  });
});
