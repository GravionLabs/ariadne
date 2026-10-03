import * as path from 'node:path';
import { parseDiagram } from '@ariadne/core';
import { createNodeParser } from '@ariadne/masstransit/node';
import { decideImport, importFromCsharp } from './import-saga';

const SOURCE = `using MassTransit;

namespace Shop;

public class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; }
}

public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    public OrderStateMachine()
    {
        InstanceState(x => x.CurrentState);
        Initially(When(OrderSubmitted).TransitionTo(Submitted));
        During(Submitted, When(OrderShipped).Finalize());
    }

    public State Submitted { get; private set; }
    public Event<OrderSubmitted> OrderSubmitted { get; private set; }
    public Event<OrderShipped> OrderShipped { get; private set; }
}

public record OrderSubmitted(Guid CorrelationId);
public record OrderShipped(Guid CorrelationId);
`;

describe('importFromCsharp', () => {
  const dir = path.resolve('/work/docs');
  const file = path.resolve('/work/src/Sagas/OrderStateMachine.cs');

  it('reads the state machine into a diagram that names its C# file', async () => {
    const { diagrams, warnings } = importFromCsharp(file, SOURCE, dir, await createNodeParser());
    expect(warnings).toEqual([]);
    expect(diagrams).toHaveLength(1);
    const [imported] = diagrams;
    expect(imported!.className).toBe('OrderStateMachine');
    expect(imported!.fileName).toBe('OrderStateMachine.saga.yaml');
    expect(imported!.diagram.saga).toMatchObject({
      className: 'OrderStateMachine',
      source: '../src/Sagas/OrderStateMachine.cs',
    });
    expect(parseDiagram(imported!.text)).toEqual(imported!.diagram);
    expect(imported!.diagram.nodes.map((n) => n.name)).toContain('Submitted');
  });

  it('gives where each state is in the code', async () => {
    const { diagrams } = importFromCsharp(file, SOURCE, dir, await createNodeParser());
    const lines = Object.values(diagrams[0]!.locations.states).map((l) => l.line);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l > 0)).toBe(true);
  });

  it('finds nothing in a file without a state machine', async () => {
    const result = importFromCsharp(file, 'class Plain {}', dir, await createNodeParser());
    expect(result.diagrams).toEqual([]);
  });

  it('does not fail on a file that is not valid C#', async () => {
    const result = importFromCsharp(file, 'class {{{ ((', dir, await createNodeParser());
    expect(result.diagrams).toEqual([]);
  });
});

describe('decideImport', () => {
  it('creates a file that is not there', () => {
    expect(decideImport(undefined, 'a')).toBe('create');
  });

  it('leaves a file that is the same', () => {
    expect(decideImport('a', 'a')).toBe('unchanged');
  });

  it('asks before replacing a file that is different', () => {
    expect(decideImport('a', 'b')).toBe('confirm');
  });

  it('treats an empty existing file as different', () => {
    expect(decideImport('', 'b')).toBe('confirm');
  });
});
