// ODD: a record, an interface, an enum and an unrelated class around the state machine.
using MassTransit;

namespace Odd;

public record Started(System.Guid CorrelationId);
public interface IThing { void Do(); }
public enum Color { Red, Green }
public class Helper { public State NotAState { get; } = null!; }

public class MixedStateMachine : MassTransitStateMachine<MixedState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public MixedStateMachine()
    {
        Initially(When(Started).TransitionTo(Working));
    }
}
