using MassTransit;

namespace Support.Tickets;

public class TicketState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = null!;
}

// Partial class, in two files: this one has the constructor.
public partial class TicketStateMachine : MassTransitStateMachine<TicketState>
{
    public TicketStateMachine()
    {
        InstanceState(x => x.CurrentState);

        Event(() => TicketOpened);
        Event(() => TicketAssigned);
        Event(() => TicketClosed);

        Initially(
            When(TicketOpened)
                .TransitionTo(Open));

        During(Open,
            AssignmentHandler(),
            Notify(When(TicketClosed))
                .TransitionTo(Closed));

        During(Assigned,
            When(TicketClosed)
                .Publish(context => new TicketResolved(context.Saga.CorrelationId))
                .Finalize());
    }
}
