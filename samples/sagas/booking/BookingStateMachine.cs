using MassTransit;

namespace Travel.Bookings;

public class BookingState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = null!;
    public Guid BookingId { get; set; }
}

// Branching on events, and events from outside in states after the first one.
public class BookingStateMachine : MassTransitStateMachine<BookingState>
{
    public State AwaitingPayment { get; private set; } = null!;
    public State Confirmed { get; private set; } = null!;
    public State Cancelled { get; private set; } = null!;

    public Event<BookingRequested> BookingRequested { get; private set; } = null!;
    public Event<PaymentReceived> PaymentReceived { get; private set; } = null!;
    public Event<CancelRequested> CancelRequested { get; private set; } = null!;
    public Event<TripStarted> TripStarted { get; private set; } = null!;
    public Event<Abort> Abort { get; private set; } = null!;

    public BookingStateMachine()
    {
        InstanceState(x => x.CurrentState, AwaitingPayment, Confirmed, Cancelled);

        Event(() => BookingRequested, x => x.CorrelateById(m => m.Message.BookingId));
        Event(() => PaymentReceived, x => x.CorrelateBy((saga, context) => saga.BookingId == context.Message.BookingId));
        Event(() => CancelRequested, x => x.CorrelateById(m => m.Message.BookingId));
        Event(() => TripStarted, x => x.CorrelateById(m => m.Message.BookingId));
        Event(() => Abort);

        Initially(
            When(BookingRequested)
                .TransitionTo(AwaitingPayment));

        During(AwaitingPayment,
            When(PaymentReceived)
                .TransitionTo(Confirmed),
            When(CancelRequested)
                .TransitionTo(Cancelled));

        During(Confirmed,
            When(CancelRequested)
                .TransitionTo(Cancelled),
            When(TripStarted)
                .Finalize());

        During(Cancelled,
            Ignore(PaymentReceived));

        DuringAny(
            When(Abort)
                .Finalize());
    }
}
