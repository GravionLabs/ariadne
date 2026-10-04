// ODD: a state machine with states and events but an empty constructor, and one with no constructor.
using MassTransit;

namespace Odd;

public class EmptyStateMachine : MassTransitStateMachine<EmptyState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public EmptyStateMachine() { }
}

public class NoConstructorStateMachine : MassTransitStateMachine<NoConstructorState>
{
    public State Working { get; private set; } = null!;
}
