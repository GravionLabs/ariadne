// ODD: broken C#: the braces of the constructor are never closed.
using MassTransit;

namespace Odd;

public class BrokenStateMachine : MassTransitStateMachine<BrokenState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public BrokenStateMachine()
    {
        Initially(When(Started).TransitionTo(Working);
