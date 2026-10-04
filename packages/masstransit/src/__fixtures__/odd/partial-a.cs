// ODD: a partial class split over two files (this one has the constructor, partial-b.cs the states).
using MassTransit;

namespace Odd.Partial;

public partial class PartialStateMachine : MassTransitStateMachine<PartialState>
{
    public PartialStateMachine()
    {
        InstanceState(x => x.CurrentState);
        Initially(When(Started).TransitionTo(Working));
        During(Working, When(Stopped).Finalize());
    }
}
