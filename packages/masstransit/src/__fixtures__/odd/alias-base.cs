// ODD: the base class reached through a using alias (the importer cannot see through it).
using SM = MassTransit.MassTransitStateMachine<Odd.AliasState>;

namespace Odd;

public class AliasStateMachine : SM
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public AliasStateMachine()
    {
        Initially(When(Started).TransitionTo(Working));
    }
}
