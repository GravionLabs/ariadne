// ODD: derives from a project base class that is not given: this must give a warning, not a saga.
using MassTransit;

namespace Odd;

public class ProjectBaseStateMachine : AuditedStateMachine<ProjectState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public ProjectBaseStateMachine()
    {
        Initially(When(Started).TransitionTo(Working));
    }
}
