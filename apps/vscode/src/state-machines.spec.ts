import { findStateMachines } from './state-machines';

describe('findStateMachines', () => {
  it('finds a class that derives from MassTransitStateMachine<T>, with its line', () => {
    const source = `using MassTransit;

public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
}`;
    expect(findStateMachines(source)).toEqual([{ name: 'OrderStateMachine', line: 2 }]);
  });

  it('finds several, also sealed and partial ones with a multi-line base list', () => {
    const source = `public sealed partial class A :
    MassTransitStateMachine<AState>, IFoo {}
class B : MassTransitStateMachine<BState> {}`;
    expect(findStateMachines(source).map((c) => [c.name, c.line])).toEqual([
      ['A', 0],
      ['B', 2],
    ]);
  });

  it('ignores other classes, the saga instance and the base class itself', () => {
    const source = `public class OrderState : SagaStateMachineInstance {}
public class Helper : IDisposable {}
public class Consumer : IConsumer<Order> {}`;
    expect(findStateMachines(source)).toEqual([]);
  });

  it('ignores a class in a comment', () => {
    const source = `// class Old : MassTransitStateMachine<OldState> {}
/* class Older : MassTransitStateMachine<OlderState> {} */
class Current : MassTransitStateMachine<CurrentState> {}`;
    expect(findStateMachines(source)).toEqual([{ name: 'Current', line: 2 }]);
  });

  it('finds nothing in an empty file', () => {
    expect(findStateMachines('')).toEqual([]);
  });
});
