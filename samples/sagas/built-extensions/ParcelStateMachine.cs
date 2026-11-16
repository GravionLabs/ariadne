using MassTransit;

namespace Logistics.Parcels;

public class ParcelState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}

public record ParcelRegistered(Guid ParcelId);
public record ParcelScanned(Guid ParcelId, string Depot);
public record ParcelDelivered(Guid ParcelId);
public record ParcelLost(Guid ParcelId);

// The handlers are built in extension methods in another class, so reading the constructor does not show them. The
// importer says it cannot follow them; a built machine has them all.
public static class ParcelHandlers
{
    public static EventActivityBinder<ParcelState, ParcelScanned> MoveOn(
        this EventActivityBinder<ParcelState, ParcelScanned> binder, State next) =>
        binder.TransitionTo(next);

    public static EventActivityBinder<ParcelState, ParcelDelivered> Complete(
        this EventActivityBinder<ParcelState, ParcelDelivered> binder) =>
        binder.Finalize();
}

public class ParcelStateMachine : MassTransitStateMachine<ParcelState>
{
    public ParcelStateMachine()
    {
        InstanceState(x => x.CurrentState, InTransit, OutForDelivery);

        Event(() => Registered, x => x.CorrelateById(c => c.Message.ParcelId));
        Event(() => Scanned, x => x.CorrelateById(c => c.Message.ParcelId));
        Event(() => Delivered, x => x.CorrelateById(c => c.Message.ParcelId));
        Event(() => Lost, x => x.CorrelateById(c => c.Message.ParcelId));

        Initially(
            When(Registered)
                .TransitionTo(InTransit));

        During(InTransit,
            When(Scanned).MoveOn(OutForDelivery));

        During(OutForDelivery,
            When(Delivered).Complete());

        DuringAny(
            When(Lost)
                .Finalize());
    }

    public State InTransit { get; private set; } = null!;
    public State OutForDelivery { get; private set; } = null!;

    public Event<ParcelRegistered> Registered { get; private set; } = null!;
    public Event<ParcelScanned> Scanned { get; private set; } = null!;
    public Event<ParcelDelivered> Delivered { get; private set; } = null!;
    public Event<ParcelLost> Lost { get; private set; } = null!;
}
