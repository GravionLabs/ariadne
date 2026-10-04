// ODD: the base class written as global::MassTransit.MassTransitStateMachine<T>.
namespace Odd;

public class GlobalStateMachine : global::MassTransit.MassTransitStateMachine<GlobalState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public GlobalStateMachine()
    {
        Initially(When(Started).TransitionTo(Working));
    }
}
