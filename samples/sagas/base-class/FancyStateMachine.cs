using MassTransit;

namespace Fancy;

// The limitation: the base class is in another assembly (or another file that is not given), so
// the importer cannot know that this is a MassTransit state machine. It says so.
public class FancyStateMachine : AuditedStateMachine<FancyState>
{
    public FancyStateMachine()
    {
        Initially(
            When(FancyHappened)
                .TransitionTo(Done));
    }

    public State Done { get; private set; } = null!;
    public Event<FancyHappened> FancyHappened { get; private set; } = null!;
}
