// ODD: events declared as properties and as fields, and several states in one declaration.
using MassTransit;

namespace Odd;

public class FormsStateMachine : MassTransitStateMachine<FormsState>
{
    public State A, B, C;
    public Event<Started> Started;
    public Event<Moved> Moved { get; private set; } = null!;
    private readonly Event<Stopped> Stopped = null!;

    public FormsStateMachine()
    {
        Initially(When(Started).TransitionTo(A));
        During(A, When(Moved).TransitionTo(B));
        During(B, When(Moved).TransitionTo(C));
        During(C, When(Stopped).Finalize());
    }
}
