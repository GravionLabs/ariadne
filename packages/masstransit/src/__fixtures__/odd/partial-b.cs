// ODD: the other half of the partial class: states and events only, no constructor.
using MassTransit;

namespace Odd.Partial;

public partial class PartialStateMachine
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;
    public Event<Stopped> Stopped { get; private set; } = null!;
}
