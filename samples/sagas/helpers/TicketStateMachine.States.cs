using MassTransit;

namespace Support.Tickets;

// ... and this one has the states, the events and the helper methods.
public partial class TicketStateMachine
{
    public State Open { get; private set; } = null!;
    public State Assigned { get; private set; } = null!;
    public State Closed { get; private set; } = null!;

    public Event<TicketOpened> TicketOpened { get; private set; } = null!;
    public Event<TicketAssigned> TicketAssigned { get; private set; } = null!;
    public Event<TicketClosed> TicketClosed { get; private set; } = null!;

    private EventActivities<TicketState> AssignmentHandler() =>
        When(TicketAssigned)
            .Send(context => new NotifyAgent(context.Saga.CorrelationId))
            .TransitionTo(Assigned);

    private static EventActivityBinder<TicketState, TicketClosed> Notify(
        EventActivityBinder<TicketState, TicketClosed> binder) =>
        binder.Publish(context => new TicketClosedNotice(context.Saga.CorrelationId));
}
