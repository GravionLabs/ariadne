import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Diagram, parseDiagram } from '@ariadne/core';
import { largeSaga } from '@ariadne/core/testing';
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
        { id: 's', type: 'state', name: 'Checking' },
        { id: 'z', type: 'end', name: 'Final' },
      ],
      edges: [
        { id: '1', source: 'a', target: 's', kind: 'forward' },
        { id: '2', source: 's', target: 'z', kind: 'forward', event: 'Nobody.Completed' },
      ],
    };
    expect(generateSaga(d).warnings).toEqual([
      'The transition Initial → Checking has no event: not generated.',
      'Nobody.Completed is the answer of a request no state makes: not generated.',
    ]);
  });
});

describe('the name of the class', () => {
  const named = (name: string): Diagram => ({
    direction: 'top-bottom',
    name,
    nodes: [{ id: 'a', type: 'start', name: 'Initial' }],
    edges: [],
  });
  const machine = (name: string) =>
    generateSaga(named(name)).files.find((f) => f.path.endsWith('StateMachine.cs'))!.path;

  it('drops a closing "saga" or "state machine" and keeps the rest', () => {
    expect(machine('Order saga')).toBe('OrderStateMachine.cs');
    expect(machine('Order State Machine  ')).toBe('OrderStateMachine.cs');
    expect(machine('Order statemachine')).toBe('OrderStateMachine.cs');
    expect(machine('Saga')).toBe('SagaStateMachine.cs');
    expect(machine('Sagas of old')).toBe('SagasOfOldStateMachine.cs');
    expect(machine('')).toBe('SagaStateMachine.cs');
  });

  it('takes no time with a long run of spaces', () => {
    const start = performance.now();
    machine(' '.repeat(100_000) + 'x');
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('generateSaga and compensation', () => {
  it('says that a compensation is written as an ordinary transition, and that its undo action is not', () => {
    const d: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        { id: 'p', type: 'state', name: 'Paying', compensation: { name: 'Refund' } },
        { id: 'f', type: 'state', name: 'Failing' },
      ],
      edges: [
        { id: '1', source: 'a', target: 'p', kind: 'forward', event: 'Placed' },
        { id: '2', source: 'p', target: 'f', kind: 'compensation', event: 'ShipFailed' },
      ],
    };
    const { files, warnings } = generateSaga(d);
    expect(warnings).toEqual([
      'The compensation Paying → Failing (ShipFailed) is written as an ordinary transition: C# does not mark it.',
      'The compensation Refund of state Paying is not generated: write the undo action yourself.',
    ]);
    expect(files[0].content).toContain('When(ShipFailed)');
  });
});

describe('generateSaga and routing slips (ADR 0023)', () => {
  const slips = (): Diagram => ({
    direction: 'top-bottom',
    nodes: [
      { id: 'a', type: 'start', name: 'Initial' },
      {
        id: 'p',
        type: 'state',
        name: 'Provisioning',
        routingSlips: [
          {
            name: 'Provision',
            activities: [{ name: 'create tenant', compensates: true }, { name: 'SendMail' }],
          },
        ],
      },
      { id: 'd', type: 'state', name: 'Active' },
      { id: 'f', type: 'state', name: 'Failed' },
    ],
    edges: [
      { id: '1', source: 'a', target: 'p', kind: 'forward', event: 'Requested' },
      { id: '2', source: 'p', target: 'd', kind: 'forward', event: 'Provision.Completed' },
      { id: '3', source: 'p', target: 'f', kind: 'forward', event: 'Provision.Faulted' },
    ],
  });

  it('builds the slip when its state is entered and waits for Courier’s outcome events', () => {
    const { files, warnings } = generateSaga(slips());
    expect(warnings).toEqual([]);
    const code = files[0].content;
    expect(code).toContain('using MassTransit.Courier.Contracts;');
    expect(code).toContain(
      'Event(() => RoutingSlipCompleted, x => x.CorrelateById(context => context.Message.TrackingNumber));',
    );
    expect(code).toContain('public Event<RoutingSlipFaulted> RoutingSlipFaulted');
    expect(code).toContain('When(RoutingSlipCompleted)\n                .TransitionTo(Active)');
    expect(code).toContain('// Routing slip: Provision');
    expect(code).toContain('new RoutingSlipBuilder(context.Saga.CorrelationId)');
    expect(code).toContain(
      'builder.AddActivity("CreateTenant", new Uri("queue:create-tenant_execute")); // compensates',
    );
    expect(code).toContain(
      'builder.AddActivity("SendMail", new Uri("queue:send-mail_execute"));\n',
    );
    expect(code).toContain('await context.Execute(builder.Build());\n            }));');
    // Courier's messages are not the saga's contracts, and are not requests.
    expect(files.find((f) => f.path === 'Contracts.cs')?.content ?? '').not.toContain('Provision');
    expect(code).not.toContain('Request(');
  });

  it('declares only the outcomes some state waits for', () => {
    const d = slips();
    d.edges = d.edges.slice(0, 2);
    const code = generateSaga(d).files[0].content;
    expect(code).toContain('RoutingSlipCompleted');
    expect(code).not.toContain('Event<RoutingSlipFaulted>');
  });

  it('does not write outcomes of two slips one state waits for, which C# cannot tell apart', () => {
    const d = slips();
    d.nodes[1].routingSlips!.push({ name: 'Notify', activities: [{ name: 'Mail' }] });
    d.edges.push({ id: '4', source: 'p', target: 'd', kind: 'forward', event: 'Notify.Completed' });
    const { files, warnings } = generateSaga(d);
    expect(warnings).toEqual([
      'Provisioning waits for the outcomes of several routing slips, which C# cannot tell apart: Provision.Completed is not generated.',
      'Provisioning waits for the outcomes of several routing slips, which C# cannot tell apart: Provision.Faulted is not generated.',
      'Provisioning waits for the outcomes of several routing slips, which C# cannot tell apart: Notify.Completed is not generated.',
    ]);
    expect(files[0].content).not.toContain('When(RoutingSlip');
    // Both slips are still started.
    expect(files[0].content).toContain('// Routing slip: Notify');
  });

  it('treats X.Completed as a request answer when no state starts a slip X', () => {
    const d = slips();
    d.nodes[1].routingSlips = undefined;
    expect(generateSaga(d).warnings).toContain(
      'Provision.Completed is the answer of a request no state makes: not generated.',
    );
  });
});

describe('generateSaga on a large saga', () => {
  it('writes C# for 50 generated states without throwing', () => {
    const { files, warnings } = generateSaga(largeSaga(50));
    expect(files.length).toBeGreaterThan(0);
    const stateMachine = files.map((f) => f.content).join('\n');
    expect(stateMachine).toContain('State50');
    expect(stateMachine).toContain('MassTransitStateMachine<');
    expect(warnings).toBeDefined();
  });
});
