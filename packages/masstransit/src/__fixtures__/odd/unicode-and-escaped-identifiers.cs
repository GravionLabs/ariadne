// ODD: unicode identifiers, @-escaped identifiers (even keywords), and a raw string literal.
using MassTransit;

namespace Odd;

public class ÜberStateMachine : MassTransitStateMachine<ÜberState>
{
    public State Läuft { get; private set; } = null!;
    public State @class { get; private set; } = null!;
    public Event<Gestartet> Gestartet { get; private set; } = null!;
    public Event<Beendet> @event { get; private set; } = null!;

    public ÜberStateMachine()
    {
        var text = """
            During(Nothing, When(Fake).TransitionTo(Fake));
            """;
        Initially(When(Gestartet).TransitionTo(Läuft));
        During(Läuft, When(@event).TransitionTo(@class));
    }
}
