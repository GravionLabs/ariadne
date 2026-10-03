import { parseDiagram } from '@ariadne/core';
import { createNodeParser } from '@ariadne/masstransit/node';
import { importFromCsharp } from './import-saga';
import { locateInCode } from './locate';

const CODE = `using MassTransit;
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

// A diagram drawn by hand: other ids, and a state name with spaces.
const HAND_DRAWN = `version: 3
saga:
  class: OrderStateMachine
direction: top-bottom
nodes:
  - id: a
    type: start
    name: Start
  - id: b
    type: state
    name: submitted
  - id: c
    type: end
    name: Done
edges:
  - id: t1
    source: a
    target: b
    kind: forward
    event: OrderSubmitted
  - id: t2
    source: b
    target: c
    kind: forward
    event: OrderShipped
  - id: t3
    source: b
    target: c
    kind: forward
    event: OrderCancelled
`;

async function setup() {
  const { diagrams } = importFromCsharp('/w/Order.cs', CODE, '/w', await createNodeParser());
  return { diagram: parseDiagram(HAND_DRAWN), code: diagrams[0]! };
}

describe('locateInCode', () => {
  it('finds a state by its name, whatever its id or spelling', async () => {
    const { diagram, code } = await setup();
    expect(locateInCode(diagram, code, { kind: 'state', id: 'b' })).toMatchObject({
      path: '/w/Order.cs',
      line: 15,
    });
  });

  it('finds a transition by its ends and event', async () => {
    const { diagram, code } = await setup();
    expect(locateInCode(diagram, code, { kind: 'transition', id: 't1' })?.line).toBe(12);
    expect(locateInCode(diagram, code, { kind: 'transition', id: 't2' })?.line).toBe(13);
  });

  it('finds nothing for a transition the code does not have', async () => {
    const { diagram, code } = await setup();
    expect(locateInCode(diagram, code, { kind: 'transition', id: 't3' })).toBeUndefined();
  });

  it('finds nothing for the initial and final state, which the code does not declare', async () => {
    const { diagram, code } = await setup();
    expect(locateInCode(diagram, code, { kind: 'state', id: 'a' })).toBeUndefined();
    expect(locateInCode(diagram, code, { kind: 'state', id: 'c' })).toBeUndefined();
  });

  it('finds nothing for an id the diagram does not have', async () => {
    const { diagram, code } = await setup();
    expect(locateInCode(diagram, code, { kind: 'state', id: 'nope' })).toBeUndefined();
    expect(locateInCode(diagram, code, { kind: 'transition', id: 'nope' })).toBeUndefined();
  });
});
